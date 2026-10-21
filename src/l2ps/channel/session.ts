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
    private opened = false
    private closed = false
    private highestSeen = 0
    /** In-flight `sendOutgoing()` calls — a checkpoint during one would be
     * non-final (the sequence is reserved but the signed message not yet
     * recorded), so `checkpoint()` refuses while this is non-zero. */
    private pendingSends = 0
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
        this.clock = opts.now ?? monotonicClock()
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
     * Capture the session's runtime state for restart recovery. Persist the
     * result (it is plain JSON) and rebuild from it with `restore()` after a
     * crash. The transcript array is copied so later messages don't mutate an
     * already-persisted snapshot. Allowed after `close()` so a final state can
     * still be recorded.
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
        return {
            channelId: this.channelId,
            members: [...this.members],
            me: this.me,
            highestSeen: this.highestSeen,
            transcript: [...this.transcript],
            openedAt: this.openedAt,
            lastActivityAt: this.lastActivityAt,
        }
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
     * rejected.
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
        session.opened = true
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
     */
    async sendOutgoing(opts: {
        type: ChannelMessageType
        body: unknown
        sentAt?: number
        repliesTo?: number
    }): Promise<ChannelMessage> {
        this.assertOpened()
        // Reserve the sequence slot SYNCHRONOUSLY before any await — two
        // concurrent sendOutgoing() calls would otherwise read the same
        // `highestSeen`, sign two messages with identical sequence
        // numbers, and silently violate the anti-replay invariant on the
        // receiver side.
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
        // Mark the send in flight across the signing await so a concurrent
        // checkpoint() refuses rather than persisting a non-final state.
        this.pendingSends++
        try {
            const signed = await signChannelMessage(unsigned, this.demos)
            this.transcript.push(signed)
            this.lastActivityAt = this.clock()
            return signed
        } finally {
            this.pendingSends--
        }
    }

    /**
     * Validate an incoming `ChannelMessage`. Throws with a precise reason
     * on any failure — caller should treat throw as channel-fatal per
     * §8.12 (a single tampered message invalidates the session's record).
     */
    async receiveIncoming(msg: ChannelMessage): Promise<void> {
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
        this.highestSeen = msg.sequence
        this.transcript.push(msg)
        this.lastActivityAt = this.clock()
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
