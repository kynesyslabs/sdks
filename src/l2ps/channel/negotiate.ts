/**
 * SR-4 WI-B — `negotiate-rfq` phase logic.
 *
 * A request-for-quote negotiation is a turn-based exchange of `offer` /
 * `counter` proposals terminating in `accept`, `reject`, or `abort`
 * (CH-5 termination; DACS-3 §8.3). Per the SR-4 brief the RFQ message
 * *bodies* are implementation-defined (only sealed-envelope bodies are
 * spec-locked, §8.4.3), so this layer fixes a minimal body schema and
 * the state machine while staying agnostic to the actual `terms`.
 *
 * `RfqSession` is a pure protocol state machine. It does not move bytes:
 * the caller wires its `send` callback to a transport (e.g.
 * `L2PSChannelTransport.send`) and feeds verified inbound envelopes to
 * `onIncoming`. By the time a message reaches `onIncoming` the channel
 * layer has already verified the signature, `sender ∈ members`, the
 * channelId, and monotonic sequence — so this layer only enforces
 * protocol-level rules (legal transitions, body shape, referencing an
 * existing offer).
 */

import type { ChannelMessage, ChannelMessageType } from "./types"
import type { ClaimReference } from "../../identity/cci"
import { envelopeHashHex, stripChannelMessageSignature } from "./canonical"
import {
    canonicalRfqMembers,
    isRfqMember,
    sameRfqMembers,
} from "./acceptedRfq"

/** Terminal + in-progress states (CH-5). */
export type RfqState = "open" | "accepted" | "rejected" | "aborted"

/** Body of an `offer` / `counter` — `terms` is opaque (impl-defined). */
export interface RfqProposalBody {
    terms: unknown
}
/** Body of an `accept` — references the proposal sequence being accepted. */
export interface RfqAcceptBody {
    acceptedSequence: number
}
/** Body of a `reject` / `abort`. */
export interface RfqEndBody {
    reason?: string
}

/** A standing proposal on the table. */
export interface StandingProposal {
    channelId: string
    messageHash: string
    sequence: number
    sender: ClaimReference
    terms: unknown
}

export interface RfqOutcome {
    state: RfqState
    /** Authenticated channel carrying the accepted proposal and acceptance. */
    channelId?: string
    /** Hashes of the exact signed exchange, not only its channel-local sequences. */
    acceptedProposalHash?: string
    acceptMessageHash?: string
    /** Set when `state === "accepted"`: the terms that were agreed. */
    agreedTerms?: unknown
    /** Sequence of the proposal that was accepted. */
    acceptedSequence?: number
    /** Reason for a reject / abort, if given. */
    reason?: string
}

export interface RfqSessionOpts {
    /** Authenticated channel identity expected on every message, when available. */
    channelId?: string
    /** Complete authenticated membership, enabling explicit outcome binding. */
    members?: ReadonlyArray<ClaimReference>
    /** This party's CCI primary claim. */
    me: ClaimReference
    /**
     * Delivers a signed channel message. Wire to the transport's send
     * (e.g. `L2PSChannelTransport.send`). Returns the signed envelope so
     * the session can track the sequence it produced.
     */
    send: (opts: {
        type: ChannelMessageType
        body: unknown
        repliesTo?: number
    }) => Promise<ChannelMessage>
    /** Fired on every state transition (including the terminal one). */
    onStateChange?: (outcome: RfqOutcome) => void
    /** Fired when a fresh proposal (offer/counter) lands, ours or theirs. */
    onProposal?: (proposal: StandingProposal) => void
    /**
     * Write-ahead persistence hook (see `ChannelSessionOpts.persist`). It is
     * awaited with a snapshot carrying a `pending` marker BEFORE each outbound
     * message leaves, and again with the settled snapshot after the local
     * transition. This closes the crash window between a terminal send (accept/
     * reject/abort) reaching the peer and the local settle, which would
     * otherwise let a restore re-open an already accepted deal. The hook must
     * write the snapshot durably, integrity-protected and atomic with the
     * matching `ChannelSession` snapshot, before it resolves.
     */
    persist?: (snapshot: RfqSessionSnapshot) => void | Promise<void>
}

/**
 * A serializable snapshot of an `RfqSession`'s state, for restart recovery.
 * It carries only plain data — the `send` callback and the lifecycle hooks
 * are NOT captured and must be re-supplied to `RfqSession.restore()`. The
 * opaque `terms` on each proposal are passed through as-is, so the caller is
 * responsible for them being serializable if the snapshot is persisted.
 */
export interface RfqSessionSnapshot {
    channelId?: string
    members?: ClaimReference[]
    me: ClaimReference
    state: RfqState
    /** The proposal currently on the table, or null. */
    standing: StandingProposal | null
    /** Every proposal seen so far, so a restored `accept` can resolve terms. */
    proposals: StandingProposal[]
    outcome: RfqOutcome
    /**
     * Whether the session was released (`close()`) when the snapshot was taken.
     * A closed session ignores all further traffic and refuses every action, so
     * it must restore closed rather than re-opening. Optional for backward
     * compatibility with snapshots taken before this field existed.
     */
    closed?: boolean
    /**
     * Set while an outbound message is mid-flight: persisted (write-ahead)
     * before the message leaves, cleared once the local transition settles. A
     * snapshot restored with it present means a send may already have reached
     * the peer, so `restore()` fails closed — it restores the session closed and
     * refuses to re-drive or re-open the negotiation.
     */
    pending?: { type: ChannelMessageType }
}

const RFQ_TYPES: ReadonlySet<ChannelMessageType> = new Set<ChannelMessageType>([
    "offer",
    "counter",
    "accept",
    "reject",
    "abort",
])

/** The valid CH-5 states a restored snapshot may carry. */
const RFQ_STATES: ReadonlySet<RfqState> = new Set<RfqState>([
    "open",
    "accepted",
    "rejected",
    "aborted",
])

export class RfqSession {
    private readonly channelId: string | undefined
    private readonly members: ReadonlyArray<ClaimReference> | undefined
    private readonly me: ClaimReference
    private readonly sendFn: RfqSessionOpts["send"]
    private readonly onStateChange?: (o: RfqOutcome) => void
    private readonly onProposal?: (p: StandingProposal) => void
    private readonly persist:
        | ((snapshot: RfqSessionSnapshot) => void | Promise<void>)
        | undefined

    private _state: RfqState = "open"
    private _closed = false
    /** In-flight `sendFn` calls. A checkpoint while one is pending would be
     * non-final: the message was emitted to the peer but the local state not
     * yet settled, so a restore from it could re-drive and reuse a sequence. */
    private _pending = 0
    private _standing: StandingProposal | null = null
    /** Every proposal seen, by sequence — so `accept` can resolve its terms. */
    private readonly proposals = new Map<number, StandingProposal>()
    private _outcome: RfqOutcome = { state: "open" }

    constructor(opts: RfqSessionOpts) {
        if (opts.channelId !== undefined && !opts.channelId)
            throw new Error("RfqSession: channelId must not be empty")
        const members = opts.members === undefined
            ? undefined
            : canonicalRfqMembers(opts.members)
        if (members && !isRfqMember(members, opts.me))
            throw new Error(`RfqSession: me (${opts.me}) is not in members`)

        this.channelId = opts.channelId
        this.members = members && Object.freeze(members)
        this.me = opts.me
        this.sendFn = opts.send
        this.onStateChange = opts.onStateChange
        this.onProposal = opts.onProposal
        this.persist = opts.persist
    }

    /** The current state as a plain snapshot object, with an optional
     * `pending` marker. Shared by `checkpoint()` and the write-ahead persists;
     * it does NOT enforce the `_pending` guard, so only `checkpoint()` exposes
     * it publicly. */
    private snapshotData(pending?: { type: ChannelMessageType }): RfqSessionSnapshot {
        return {
            ...(this.channelId !== undefined && { channelId: this.channelId }),
            ...(this.members !== undefined && { members: [...this.members] }),
            me: this.me,
            state: this._state,
            standing: this._standing,
            proposals: [...this.proposals.values()],
            outcome: this._outcome,
            closed: this._closed,
            ...(pending !== undefined && { pending }),
        }
    }

    /** Persist the settled state after an outbound transition, clearing the
     * write-ahead `pending` marker. No-op without a `persist` hook. */
    private async persistSettled(): Promise<void> {
        if (this.persist) await this.persist(this.snapshotData())
    }

    get state(): RfqState {
        return this._state
    }
    /** The proposal currently on the table, or null before the first offer. */
    get standingProposal(): StandingProposal | null {
        return this._standing
    }
    outcome(): RfqOutcome {
        return this._outcome
    }

    /**
     * Capture the negotiation's state for restart recovery. Persist the result
     * and rebuild from it with `restore()` after a crash. The proposal list is
     * copied so later proposals don't mutate an already-persisted snapshot.
     * Allowed after `close()` so a final state can still be recorded.
     *
     * The snapshot MUST be stored integrity-protected and written atomically
     * together with the matching `ChannelSession` snapshot, so the two never
     * disagree after a crash. For live write-ahead durability prefer the
     * `persist` hook (see `RfqSessionOpts.persist`) over polling `checkpoint()`.
     */
    checkpoint(): RfqSessionSnapshot {
        // A send in flight has already reached the peer but not yet settled
        // locally. Snapshotting here would persist an "open" negotiation the
        // peer already sees as accepted/ended; a restore would re-drive it and
        // mint a duplicate message at a reused sequence. Refuse until it settles.
        if (this._pending > 0)
            throw new Error(
                "RfqSession: cannot checkpoint while a send is in flight",
            )
        return this.snapshotData()
    }

    /**
     * Rebuild a negotiation from a `checkpoint()` snapshot. The `send`
     * callback, lifecycle hooks and `persist` hook are re-injected — they are
     * not part of the snapshot. The restored session resumes in its exact prior
     * state, so a negotiation that had already settled stays terminal and
     * cannot be re-driven.
     *
     * The snapshot is UNTRUSTED: its state and outcome enums, the standing
     * proposal's membership in the proposal list, each proposal's shape and
     * sequence uniqueness, and the outcome matching the recorded state are all
     * re-validated here; a mismatch refuses the restore. A snapshot with a
     * write-ahead `pending` marker (a send was mid-flight at the crash) is
     * restored CLOSED and cannot be re-driven.
     */
    static restore(
        snapshot: RfqSessionSnapshot,
        opts: Pick<
            RfqSessionOpts,
            "send" | "onStateChange" | "onProposal" | "persist"
        >,
    ): RfqSession {
        if (!snapshot || typeof snapshot !== "object")
            throw new Error("RfqSession.restore: snapshot required")
        if (!Array.isArray(snapshot.proposals))
            throw new Error("RfqSession.restore: proposals must be an array")
        if (!RFQ_STATES.has(snapshot.state))
            throw new Error(
                `RfqSession.restore: invalid state ${String(snapshot.state)}`,
            )
        if (
            !snapshot.outcome ||
            typeof snapshot.outcome !== "object" ||
            snapshot.outcome.state !== snapshot.state
        )
            throw new Error(
                "RfqSession.restore: outcome missing or does not match the recorded state",
            )

        // Re-validate the proposal list: each a well-formed proposal with a
        // unique positive sequence.
        const seenSequences = new Set<number>()
        for (const proposal of snapshot.proposals) {
            if (!proposal || typeof proposal !== "object")
                throw new Error("RfqSession.restore: malformed proposal entry")
            if (
                !Number.isInteger(proposal.sequence) ||
                proposal.sequence < 1
            )
                throw new Error(
                    `RfqSession.restore: invalid proposal sequence ${proposal.sequence}`,
                )
            if (seenSequences.has(proposal.sequence))
                throw new Error(
                    `RfqSession.restore: duplicate proposal sequence ${proposal.sequence}`,
                )
            seenSequences.add(proposal.sequence)
        }
        // The standing proposal, when set, must be one of the recorded
        // proposals (same sequence and identity) — not an injected one.
        if (snapshot.standing !== null) {
            const match = snapshot.proposals.find(
                p => p.sequence === snapshot.standing!.sequence,
            )
            if (
                !match ||
                match.messageHash !== snapshot.standing.messageHash ||
                match.channelId !== snapshot.standing.channelId
            )
                throw new Error(
                    "RfqSession.restore: standing proposal is not in the proposal list",
                )
        }
        // An accepted negotiation must reference a known proposal.
        if (
            snapshot.state === "accepted" &&
            snapshot.outcome.acceptedSequence !== undefined &&
            !seenSequences.has(snapshot.outcome.acceptedSequence)
        )
            throw new Error(
                "RfqSession.restore: accepted outcome references an unknown proposal",
            )

        const session = new RfqSession({
            channelId: snapshot.channelId,
            members: snapshot.members,
            me: snapshot.me,
            send: opts.send,
            onStateChange: opts.onStateChange,
            onProposal: opts.onProposal,
            ...(opts.persist !== undefined && { persist: opts.persist }),
        })
        session._state = snapshot.state
        session._standing = snapshot.standing
        for (const proposal of snapshot.proposals)
            session.proposals.set(proposal.sequence, proposal)
        session._outcome = snapshot.outcome
        // A send was in flight when the snapshot was taken: fail closed so a
        // restart never re-drives it or re-opens an accepted deal.
        session._closed = snapshot.closed === true || snapshot.pending !== undefined
        return session
    }

    /**
     * Release the session. After `close()` no further offer/counter/accept/
     * reject/abort is allowed and inbound messages are ignored; `outcome()`
     * and `checkpoint()` still read the final state. Idempotent, and a no-op
     * distinction from the CH-5 terminal states — this is local shutdown, not
     * a negotiated end.
     */
    close(): void {
        this._closed = true
    }

    /** Open a negotiation with the first proposal. */
    async offer(terms: unknown): Promise<ChannelMessage> {
        this.assertOpen("offer")
        if (this._standing)
            throw new Error(
                "RfqSession: a proposal already stands; use counter()",
            )
        return this.proposeOutgoing("offer", terms)
    }

    /** Counter the standing proposal with new terms. */
    async counter(terms: unknown): Promise<ChannelMessage> {
        this.assertOpen("counter")
        if (!this._standing)
            throw new Error("RfqSession: nothing to counter — no standing offer")
        return this.proposeOutgoing("counter", terms, this._standing.sequence)
    }

    /** Accept the standing proposal — terminal (CH-5). */
    async accept(): Promise<ChannelMessage> {
        this.assertOpen("accept")
        if (!this._standing)
            throw new Error("RfqSession: nothing to accept — no standing offer")
        // You cannot accept your own proposal: acceptance is the
        // counterparty agreeing to the terms on the table. Accepting a
        // self-authored standing proposal would settle the negotiation
        // (and produce a transcript) without the other side ever agreeing.
        if (sameRfqMembers([this._standing.sender], [this.me]))
            throw new Error(
                "RfqSession: cannot accept your own proposal — wait for the counterparty",
            )
        const accepted = this._standing
        const body: RfqAcceptBody = { acceptedSequence: accepted.sequence }
        const msg = await this.trackSend({
            type: "accept",
            body,
            repliesTo: accepted.sequence,
        })
        this.settleAccepted(accepted, msg)
        await this.persistSettled()
        return msg
    }

    /** Reject the negotiation — terminal (CH-5). */
    async reject(reason?: string): Promise<ChannelMessage> {
        this.assertOpen("reject")
        const body: RfqEndBody = reason ? { reason } : {}
        const msg = await this.trackSend({ type: "reject", body })
        this.settle({ state: "rejected", reason })
        await this.persistSettled()
        return msg
    }

    /** Abort the negotiation — terminal (CH-5). */
    async abort(reason?: string): Promise<ChannelMessage> {
        this.assertOpen("abort")
        const body: RfqEndBody = reason ? { reason } : {}
        const msg = await this.trackSend({ type: "abort", body })
        this.settle({ state: "aborted", reason })
        await this.persistSettled()
        return msg
    }

    /**
     * Feed a verified inbound channel message. No-op for non-RFQ types or
     * messages arriving after a terminal state (a late duplicate of an
     * end message). Throws only on a protocol violation that the channel
     * layer can't catch (e.g. accept referencing an unknown proposal).
     */
    onIncoming(msg: ChannelMessage): void {
        if (this._closed) return // released locally — ignore all traffic
        if (!RFQ_TYPES.has(msg.type)) return
        if (sameRfqMembers([msg.sender], [this.me])) return // own echo, already applied
        if (this._state !== "open") return // terminal — ignore trailing traffic
        this.assertIncomingScope(msg)

        switch (msg.type) {
            case "offer": {
                // An offer opens a negotiation: it is only legal when no
                // proposal stands yet. A second inbound offer must not
                // overwrite the standing proposal — `offer()` rejects the
                // same case outbound, so the inbound path enforces it too.
                if (this._standing)
                    throw new Error(
                        `RfqSession: inbound offer (seq ${msg.sequence}) but a proposal already stands (seq ${this._standing.sequence})`,
                    )
                this.acceptProposal(msg)
                break
            }
            case "counter": {
                // A counter replaces the standing proposal — illegal before
                // any offer exists, mirroring `counter()` outbound.
                if (!this._standing)
                    throw new Error(
                        `RfqSession: inbound counter (seq ${msg.sequence}) but no standing offer to counter`,
                    )
                this.acceptProposal(msg)
                break
            }
            case "accept": {
                const seq = (msg.body as RfqAcceptBody)?.acceptedSequence
                const accepted = this.proposals.get(seq)
                if (!accepted)
                    throw new Error(
                        `RfqSession: accept references unknown proposal sequence ${seq}`,
                    )
                // The accept must reference the proposal currently on the
                // table. Once a counter supersedes an earlier offer, that
                // older offer is off the table — accepting it would settle
                // obsolete terms instead of what is currently being
                // negotiated.
                if (!this._standing || seq !== this._standing.sequence)
                    throw new Error(
                        `RfqSession: accept references stale proposal seq ${seq}; standing proposal is seq ${
                            this._standing?.sequence ?? "none"
                        }`,
                    )
                this.settleAccepted(accepted, msg)
                break
            }
            case "reject": {
                this.settle({
                    state: "rejected",
                    reason: (msg.body as RfqEndBody)?.reason,
                })
                break
            }
            case "abort": {
                this.settle({
                    state: "aborted",
                    reason: (msg.body as RfqEndBody)?.reason,
                })
                break
            }
        }
    }

    private assertIncomingScope(msg: ChannelMessage): void {
        if (this.channelId && msg.channelId !== this.channelId)
            throw new Error("RfqSession: message changed channel")
        if (this.members && !isRfqMember(this.members, msg.sender))
            throw new Error(`RfqSession: sender "${msg.sender}" is not a member`)
    }

    /** Record a verified inbound offer/counter as the standing proposal. */
    private acceptProposal(msg: ChannelMessage): void {
        const terms = (msg.body as RfqProposalBody)?.terms
        const proposal: StandingProposal = {
            channelId: msg.channelId,
            messageHash: envelopeHashHex(stripChannelMessageSignature(msg)),
            sequence: msg.sequence,
            sender: msg.sender,
            terms,
        }
        this.proposals.set(msg.sequence, proposal)
        this._standing = proposal
        this.onProposal?.(proposal)
    }

    private async proposeOutgoing(
        type: "offer" | "counter",
        terms: unknown,
        repliesTo?: number,
    ): Promise<ChannelMessage> {
        const body: RfqProposalBody = { terms }
        const msg = await this.trackSend({ type, body, repliesTo })
        if (this.channelId && msg.channelId !== this.channelId)
            throw new Error("RfqSession: proposal changed channel")
        if (!sameRfqMembers([msg.sender], [this.me]))
            throw new Error(
                "RfqSession: proposal sender is not this session's identity",
            )
        if (msg.type !== type)
            throw new Error(`RfqSession: send returned ${msg.type}, expected ${type}`)
        const proposal: StandingProposal = {
            channelId: msg.channelId,
            messageHash: envelopeHashHex(stripChannelMessageSignature(msg)),
            sequence: msg.sequence,
            sender: this.me,
            terms,
        }
        this.proposals.set(msg.sequence, proposal)
        this._standing = proposal
        this.onProposal?.(proposal)
        await this.persistSettled()
        return msg
    }

    private settleAccepted(
        accepted: StandingProposal,
        accept: ChannelMessage,
    ): void {
        if (accept.channelId !== accepted.channelId ||
            (this.channelId && accept.channelId !== this.channelId))
            throw new Error("RfqSession: acceptance changed channel")
        if (accept.type !== "accept" ||
            (accept.body as RfqAcceptBody)?.acceptedSequence !== accepted.sequence ||
            accept.refs?.repliesTo !== accepted.sequence)
            throw new Error("RfqSession: malformed acceptance reference")
        if (this.members && !isRfqMember(this.members, accept.sender))
            throw new Error(
                `RfqSession: accept sender "${accept.sender}" is not a member`,
            )
        if (sameRfqMembers([accept.sender], [accepted.sender]))
            throw new Error(
                "RfqSession: proposal author cannot accept their own proposal",
            )

        const acceptMessageHash = envelopeHashHex(
            stripChannelMessageSignature(accept),
        )
        this.settle({
            state: "accepted",
            channelId: accepted.channelId,
            acceptedProposalHash: accepted.messageHash,
            acceptMessageHash,
            agreedTerms: accepted.terms,
            acceptedSequence: accepted.sequence,
        })
    }

    private settle(outcome: RfqOutcome): void {
        this._state = outcome.state
        this._outcome = outcome
        this.onStateChange?.(outcome)
    }

    /**
     * Deliver through `sendFn` while counting the call as in-flight, so a
     * `checkpoint()` taken across the await refuses rather than persisting a
     * state the peer has already moved past. The state mutation that follows
     * each send runs synchronously after the await, so it is atomic with the
     * counter dropping back to zero.
     */
    private async trackSend(opts: {
        type: ChannelMessageType
        body: unknown
        repliesTo?: number
    }): Promise<ChannelMessage> {
        // Write-ahead: record that this message is leaving, BEFORE it does, so a
        // crash before the local transition cannot re-open or re-drive it on
        // restore (the `pending` marker makes restore() fail closed).
        if (this.persist) await this.persist(this.snapshotData({ type: opts.type }))
        this._pending++
        try {
            return await this.sendFn(opts)
        } finally {
            this._pending--
        }
    }

    private assertOpen(action: string): void {
        if (this._closed)
            throw new Error(`RfqSession: cannot ${action} — session is closed`)
        if (this._state !== "open")
            throw new Error(
                `RfqSession: cannot ${action} — negotiation is ${this._state}`,
            )
    }
}
