import { Demos } from "@/websdk/demosclass"
import type { ClaimReference } from "@/identity/cci"
import type {
    ChannelMessage,
    ChannelMessageType,
    UnsignedChannelMessage,
} from "./types"
import {
    isSenderInMembers,
    signChannelMessage,
    verifyChannelMessage,
} from "./envelope"
import type { ChannelIdRegistry } from "./channelIdRegistry"
import {
    checkLiveness,
    monotonicClock,
    type LivenessPolicy,
    type LivenessState,
} from "./liveness"

export interface ChannelSessionOpts {
    channelId: string
    members: ClaimReference[]
    /** This party's primary claim — must be in `members`. */
    me: ClaimReference
    demos: Demos
    /**
     * Optional CH-6 enforcement. If provided, `open()` registers the
     * channelId here and throws on reuse.
     */
    channelIdRegistry?: ChannelIdRegistry
    /**
     * Clock for CH-4 liveness. Injectable so delivery bounds are testable
     * without waiting on wall time.
     *
     * Defaults to a MONOTONIC source. A wall clock steps backwards (NTP, a
     * manual correction) and a backwards step would push the deadline out until
     * real time caught up — the stall would go unnoticed for exactly as long as
     * the jump. Supply your own only if it is monotonic too.
     */
    now?: () => number
    /**
     * Write-ahead persistence hook. When supplied, it is awaited with the full
     * post-mutation snapshot BEFORE a freshly signed outgoing message is
     * returned to the caller (i.e. before it can leave the process), and after
     * each accepted incoming message. This closes the crash window between a
     * send and the caller's next `checkpoint()`: without it, a crash after the
     * message is delivered but before a checkpoint would restore an older floor
     * and let the just-used sequence be signed again. The hook must write the
     * snapshot durably (and, per `checkpoint()`, integrity-protected and atomic
     * with the RFQ snapshot) before it resolves; if it rejects, the send fails
     * and nothing is delivered. Mutations are serialized, so the hook is never
     * called concurrently for one session.
     */
    persist?: (snapshot: ChannelSessionSnapshot) => void | Promise<void>
}

/**
 * A serializable snapshot of a `ChannelSession`'s runtime state, for
 * restart recovery. It carries only plain-JSON data — the live `demos`
 * client, the CH-6 registry, and the clock are NOT captured and must be
 * re-supplied to `ChannelSession.restore()`. Persist one with
 * `checkpoint()` as the session progresses; after a crash or restart,
 * rebuild the session from the last persisted snapshot.
 */
export interface ChannelSessionSnapshot {
    channelId: string
    members: ClaimReference[]
    me: ClaimReference
    /** Highest sequence signed or accepted so far (anti-replay floor). */
    highestSeen: number
    /** Every message this session has signed or accepted, in order. */
    transcript: ChannelMessage[]
    /** Local CH-4 timestamps, in the clock units of the session that took it. */
    openedAt: number
    lastActivityAt: number
    /**
     * Whether the session was closed when the snapshot was taken. A closed
     * session must restore as closed — otherwise a crash right after `close()`
     * would re-open a finished negotiation. Optional for backward compatibility
     * with snapshots taken before this field existed (treated as not closed).
     */
    closed?: boolean
}

/**
 * Per-channel session — owns the monotonic sequence counter and applies
 * the four invariants from §8.3.3 / §8.12 on every message:
 *
 *   1. signature verifies under sender's CCI key
 *   2. sender ∈ members (CH-1)
 *   3. sequence is monotonic per channel (anti-replay)
 *   4. channelId matches the session's channelId
 *
 * A single counter is shared across senders, as the brief specifies
 * (`sequence: number  // monotonic per channel, starts at 1`). Outgoing
 * messages get `current + 1`; incoming messages must use a sequence
 * strictly greater than every value already seen.
 */
export class ChannelSession {
    readonly channelId: string
    readonly members: ReadonlyArray<ClaimReference>
    readonly me: ClaimReference
    /**
     * Highest sequence this session has signed or accepted — the anti-replay
     * floor. Exposed so a transport can resume from a RESTORED session's
     * position: `L2PSChannelTransport` seeds its contiguous-apply counter from
     * this, otherwise a restored session would wait forever for sequence 1.
     */
    get highestSequence(): number {
        return this.highestSeen
    }
    private readonly demos: Demos
    private readonly registry: ChannelIdRegistry | undefined
    private readonly persist:
        | ((snapshot: ChannelSessionSnapshot) => void | Promise<void>)
        | undefined
    private opened = false
    private closed = false
    private highestSeen = 0
    /** In-flight `sendOutgoing()` calls — a checkpoint during one would be
     * non-final (the sequence is reserved but the signed message not yet
     * recorded), so `checkpoint()` refuses while this is non-zero. */
    private pendingSends = 0
    /** Serializes every state mutation (send and receive) so the write-ahead
     * snapshot each one persists is internally consistent — the floor never
     * runs ahead of the transcript the same snapshot carries — and two sends
     * never interleave mid-persist. */
    private opChain: Promise<void> = Promise.resolve()
    private readonly transcript: ChannelMessage[] = []
    private readonly clock: () => number
    /** Local times — CH-4 is measured on what THIS member observed, never on
     * a peer's self-reported `sentAt`. */
    private openedAt = 0
    private lastActivityAt = 0

    constructor(opts: ChannelSessionOpts) {
        if (!opts.channelId) throw new Error("ChannelSession: channelId required")
        if (!opts.members?.length)
            throw new Error("ChannelSession: members required")
        if (!opts.members.includes(opts.me))
            throw new Error(
                `ChannelSession: me (${opts.me}) is not in members`,
            )

        this.channelId = opts.channelId
        this.members = [...opts.members]
        this.me = opts.me
        this.demos = opts.demos
        this.registry = opts.channelIdRegistry
        this.persist = opts.persist
        this.clock = opts.now ?? monotonicClock()
    }

    /**
     * Run `fn` after every previously queued mutation has settled, so sends and
     * receives (and their write-ahead persists) never interleave. A rejection
     * does not break the chain for the next caller.
     */
    private runSerial<T>(fn: () => Promise<T>): Promise<T> {
        const result = this.opChain.then(fn, fn)
        // Keep the chain alive regardless of this op's outcome.
        this.opChain = result.then(
            () => undefined,
            () => undefined,
        )
        return result
    }

    /**
     * Register the channelId (CH-6) and prepare for messaging. Idempotent
     * within a session — calling twice throws via the registry.
     */
    async open(): Promise<void> {
        if (this.opened)
            throw new Error("ChannelSession: already opened")
        if (this.registry) await this.registry.register(this.channelId)
        this.opened = true
        this.openedAt = this.clock()
        this.lastActivityAt = this.openedAt
    }

    /**
     * Build a plain-JSON snapshot of the current state. `append`, when given,
     * is included in the transcript the snapshot carries (the write-ahead case:
     * a just-signed message not yet pushed); `lastActivityAt` overrides the
     * recorded local time. The transcript is copied so later messages don't
     * mutate an already-persisted snapshot.
     */
    private buildSnapshot(opts?: {
        append?: ChannelMessage
        lastActivityAt?: number
    }): ChannelSessionSnapshot {
        return {
            channelId: this.channelId,
            members: [...this.members],
            me: this.me,
            highestSeen: this.highestSeen,
            transcript: opts?.append
                ? [...this.transcript, opts.append]
                : [...this.transcript],
            openedAt: this.openedAt,
            lastActivityAt: opts?.lastActivityAt ?? this.lastActivityAt,
            closed: this.closed,
        }
    }

    /**
     * Capture the session's runtime state for restart recovery. Persist the
     * result (it is plain JSON) and rebuild from it with `restore()` after a
     * crash. Allowed after `close()` so a final state can still be recorded.
     *
     * The persisted snapshot is a trust anchor on restore: the caller MUST
     * store it integrity-protected (a tampered transcript is otherwise only
     * caught where `restore()` can re-verify it) and MUST write it atomically
     * together with the matching `RfqSession` snapshot, so the two never
     * disagree after a crash. For live write-ahead durability, prefer the
     * `persist` hook (see `ChannelSessionOpts.persist`) over polling
     * `checkpoint()`: the hook closes the crash window between a send and the
     * next checkpoint.
     */
    checkpoint(): ChannelSessionSnapshot {
        if (!this.opened)
            throw new Error("ChannelSession: cannot checkpoint before open()")
        // A send in flight has already reserved its sequence (`++highestSeen`)
        // but not yet appended the signed message. Snapshotting here would
        // persist the advanced floor without the message, or — if restored —
        // let that sequence be reused. Refuse until the send settles.
        if (this.pendingSends > 0)
            throw new Error(
                "ChannelSession: cannot checkpoint while a send is in flight",
            )
        return this.buildSnapshot()
    }

    /**
     * Rebuild a session from a `checkpoint()` snapshot. The live `demos`
     * client (and optionally the registry/clock) are re-injected — they are
     * not part of the snapshot.
     *
     * Unlike `open()`, this does NOT register the channelId with the CH-6
     * registry: the id was registered before the restart, and re-registering
     * it would (correctly) throw as reuse. The restored session resumes at the
     * exact sequence floor it had, so a replayed older message is still
     * rejected. For CH-6 across a restart the registry MUST be durable: the
     * in-memory default forgets every id on process exit, so with it a restored
     * channelId could be reused. Supply a registry backed by durable storage
     * (or the chain) whenever reuse must stay blocked after a restart.
     *
     * The persisted snapshot is UNTRUSTED: a tampered store could inject
     * messages the session would then co-sign on (e.g. via `finalizeRfq`).
     * Every transcript entry is therefore re-validated here exactly as
     * `receiveIncoming` validates a live message — channelId, membership,
     * sequence validity and uniqueness, and signature — and the recorded
     * `highestSeen` must cover the highest transcript sequence. Any mismatch
     * refuses the restore.
     */
    static restore(
        snapshot: ChannelSessionSnapshot,
        opts: Omit<ChannelSessionOpts, "channelId" | "members" | "me">,
    ): ChannelSession {
        if (!snapshot || typeof snapshot !== "object")
            throw new Error("ChannelSession.restore: snapshot required")
        if (!Number.isInteger(snapshot.highestSeen) || snapshot.highestSeen < 0)
            throw new Error(
                `ChannelSession.restore: invalid highestSeen ${snapshot.highestSeen}`,
            )
        if (!Array.isArray(snapshot.transcript))
            throw new Error("ChannelSession.restore: transcript must be an array")

        const session = new ChannelSession({
            channelId: snapshot.channelId,
            members: snapshot.members,
            me: snapshot.me,
            demos: opts.demos,
            channelIdRegistry: opts.channelIdRegistry,
            now: opts.now,
        })

        // Re-validate the persisted transcript before trusting it. Same checks
        // as receiveIncoming, but order-independent: a live transcript is not
        // sorted by sequence (a send reserves its sequence before signing, so a
        // concurrent receive with a higher sequence can be appended first), so
        // we require each sequence to be UNIQUE rather than strictly ascending.
        // Sequences must still be distinct (no replay) and the recorded floor
        // must cover the highest one; a tampered entry is rejected, not replayed.
        const seenSequences = new Set<number>()
        let maxSeq = 0
        for (const msg of snapshot.transcript) {
            if (!msg || typeof msg !== "object")
                throw new Error(
                    "ChannelSession.restore: transcript entry is not a message",
                )
            if (msg.channelId !== session.channelId)
                throw new Error(
                    `ChannelSession.restore: transcript channelId mismatch (expected ${session.channelId}, got ${msg.channelId})`,
                )
            if (!isSenderInMembers(msg, session.members))
                throw new Error(
                    `ChannelSession.restore: transcript sender "${msg.sender}" not in members (CH-1)`,
                )
            if (!Number.isInteger(msg.sequence) || msg.sequence < 1)
                throw new Error(
                    `ChannelSession.restore: invalid transcript sequence ${msg.sequence}`,
                )
            if (seenSequences.has(msg.sequence))
                throw new Error(
                    `ChannelSession.restore: duplicate transcript sequence ${msg.sequence}`,
                )
            if (!verifyChannelMessage(msg))
                throw new Error(
                    `ChannelSession.restore: transcript signature verification failed at sequence ${msg.sequence}`,
                )
            seenSequences.add(msg.sequence)
            if (msg.sequence > maxSeq) maxSeq = msg.sequence
        }
        if (snapshot.highestSeen < maxSeq)
            throw new Error(
                `ChannelSession.restore: highestSeen ${snapshot.highestSeen} below highest transcript sequence ${maxSeq}`,
            )

        session.opened = true
        session.closed = snapshot.closed === true
        session.highestSeen = snapshot.highestSeen
        session.transcript.push(...snapshot.transcript)
        session.openedAt = snapshot.openedAt
        session.lastActivityAt = snapshot.lastActivityAt
        return session
    }

    /**
     * Release the session. After `close()` no further `sendOutgoing()` or
     * `receiveIncoming()` is allowed; `messages()` and `checkpoint()` still
     * read the final record. Idempotent.
     */
    close(): void {
        this.closed = true
    }

    /**
     * CH-4 — is the channel still within its delivery bounds, as observed by
     * THIS member? Returns a state rather than throwing: a counterparty going
     * quiet is an expected outcome, and the member reacts by aborting the
     * negotiation (CH-5), which is a policy decision this layer doesn't make.
     */
    liveness(policy?: LivenessPolicy, now?: number): LivenessState {
        this.assertOpened()
        return checkLiveness({
            openedAt: this.openedAt,
            lastActivityAt: this.lastActivityAt,
            policy,
            now: now ?? this.clock(),
        })
    }

    /**
     * Build, sign, append-to-local-transcript, and return the next
     * outgoing `ChannelMessage`. Sequence is `highestSeen + 1` so it is
     * monotonic across both directions.
     *
     * Serialized against every other send and receive, so the write-ahead
     * snapshot is consistent. With a `persist` hook, the new floor and this
     * message are persisted BEFORE the signed message is returned (before it
     * can leave the process); if signing or persistence fails, nothing is
     * returned, the reserved sequence is released (the floor rolls back exactly
     * one step — safe because the section is serialized), and no gap or reuse
     * results.
     */
    async sendOutgoing(opts: {
        type: ChannelMessageType
        body: unknown
        sentAt?: number
        repliesTo?: number
    }): Promise<ChannelMessage> {
        this.assertOpened()
        // Mark the send in flight SYNCHRONOUSLY at call time — before it is even
        // queued — so a `checkpoint()` in the same tick refuses rather than
        // capturing a non-final state. Cleared once the send fully settles.
        this.pendingSends++
        try {
            return await this.runSerial(async () => {
                // close() may have landed while this call waited its turn.
                this.assertOpened()
                // Reserve the next sequence. The section is serialized, so no
                // other send or receive advances `highestSeen` until this one
                // settles.
                const sequence = ++this.highestSeen
                const unsigned: UnsignedChannelMessage = {
                    channelId: this.channelId,
                    sequence,
                    sender: this.me,
                    sentAt: opts.sentAt ?? Date.now(),
                    type: opts.type,
                    body: opts.body,
                    ...(opts.repliesTo !== undefined && {
                        refs: { repliesTo: opts.repliesTo },
                    }),
                }
                try {
                    const signed = await signChannelMessage(unsigned, this.demos)
                    const now = this.clock()
                    // Write-ahead: durably record the new floor and this message
                    // before it leaves the process, closing the crash window
                    // between the send and the caller's next checkpoint.
                    if (this.persist)
                        await this.persist(
                            this.buildSnapshot({ append: signed, lastActivityAt: now }),
                        )
                    this.transcript.push(signed)
                    this.lastActivityAt = now
                    return signed
                } catch (err) {
                    // Signing or write-ahead persist failed: the message never
                    // left. Release the reserved sequence so no gap is left and
                    // the next send reuses it cleanly (serialized → floor is
                    // still this reservation).
                    this.highestSeen = sequence - 1
                    throw err
                }
            })
        } finally {
            this.pendingSends--
        }
    }

    /**
     * Validate an incoming `ChannelMessage`. Throws with a precise reason
     * on any failure — caller should treat throw as channel-fatal per
     * §8.12 (a single tampered message invalidates the session's record).
     *
     * Serialized against sends and other receives; with a `persist` hook the
     * raised floor is written durably before the call resolves, and a failed
     * persist rolls the application back so the in-memory floor never runs
     * ahead of what was recorded.
     */
    async receiveIncoming(msg: ChannelMessage): Promise<void> {
        this.assertOpened()
        return this.runSerial(async () => {
            this.assertOpened()
            if (msg.channelId !== this.channelId)
                throw new Error(
                    `ChannelSession: channelId mismatch (expected ${this.channelId}, got ${msg.channelId})`,
                )
            if (!isSenderInMembers(msg, this.members))
                throw new Error(
                    `ChannelSession: sender "${msg.sender}" not in members (CH-1)`,
                )
            if (!Number.isInteger(msg.sequence) || msg.sequence < 1)
                throw new Error(
                    `ChannelSession: invalid sequence ${msg.sequence}`,
                )
            if (msg.sequence <= this.highestSeen)
                throw new Error(
                    `ChannelSession: non-monotonic sequence ${msg.sequence} (highest seen ${this.highestSeen})`,
                )
            if (!verifyChannelMessage(msg))
                throw new Error(
                    "ChannelSession: signature verification failed",
                )
            const previousHighest = this.highestSeen
            const previousLength = this.transcript.length
            this.highestSeen = msg.sequence
            this.transcript.push(msg)
            this.lastActivityAt = this.clock()
            if (this.persist) {
                try {
                    await this.persist(this.buildSnapshot())
                } catch (err) {
                    // Durable record failed: undo so the floor never runs ahead
                    // of the store. The caller treats the throw as channel-fatal.
                    this.highestSeen = previousHighest
                    this.transcript.length = previousLength
                    throw err
                }
            }
        })
    }

    /** Read-only snapshot of all messages this session has signed or accepted. */
    messages(): ReadonlyArray<ChannelMessage> {
        return this.transcript
    }

    private assertOpened(): void {
        if (this.closed)
            throw new Error("ChannelSession: session is closed")
        if (!this.opened)
            throw new Error(
                "ChannelSession: call open() before sending or receiving",
            )
    }
}
