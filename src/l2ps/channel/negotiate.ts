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
    sequence: number
    sender: ClaimReference
    terms: unknown
}

export interface RfqOutcome {
    state: RfqState
    /** Set when `state === "accepted"`: the terms that were agreed. */
    agreedTerms?: unknown
    /** Sequence of the proposal that was accepted. */
    acceptedSequence?: number
    /** Reason for a reject / abort, if given. */
    reason?: string
}

export interface RfqSessionOpts {
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
}

const RFQ_TYPES: ReadonlySet<ChannelMessageType> = new Set<ChannelMessageType>([
    "offer",
    "counter",
    "accept",
    "reject",
    "abort",
])

export class RfqSession {
    private readonly me: ClaimReference
    private readonly sendFn: RfqSessionOpts["send"]
    private readonly onStateChange?: (o: RfqOutcome) => void
    private readonly onProposal?: (p: StandingProposal) => void

    private _state: RfqState = "open"
    private _standing: StandingProposal | null = null
    /** Every proposal seen, by sequence — so `accept` can resolve its terms. */
    private readonly proposals = new Map<number, StandingProposal>()
    private _outcome: RfqOutcome = { state: "open" }

    constructor(opts: RfqSessionOpts) {
        this.me = opts.me
        this.sendFn = opts.send
        this.onStateChange = opts.onStateChange
        this.onProposal = opts.onProposal
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
        const accepted = this._standing
        const body: RfqAcceptBody = { acceptedSequence: accepted.sequence }
        const msg = await this.sendFn({
            type: "accept",
            body,
            repliesTo: accepted.sequence,
        })
        this.settle({
            state: "accepted",
            agreedTerms: accepted.terms,
            acceptedSequence: accepted.sequence,
        })
        return msg
    }

    /** Reject the negotiation — terminal (CH-5). */
    async reject(reason?: string): Promise<ChannelMessage> {
        this.assertOpen("reject")
        const body: RfqEndBody = reason ? { reason } : {}
        const msg = await this.sendFn({ type: "reject", body })
        this.settle({ state: "rejected", reason })
        return msg
    }

    /** Abort the negotiation — terminal (CH-5). */
    async abort(reason?: string): Promise<ChannelMessage> {
        this.assertOpen("abort")
        const body: RfqEndBody = reason ? { reason } : {}
        const msg = await this.sendFn({ type: "abort", body })
        this.settle({ state: "aborted", reason })
        return msg
    }

    /**
     * Feed a verified inbound channel message. No-op for non-RFQ types or
     * messages arriving after a terminal state (a late duplicate of an
     * end message). Throws only on a protocol violation that the channel
     * layer can't catch (e.g. accept referencing an unknown proposal).
     */
    onIncoming(msg: ChannelMessage): void {
        if (!RFQ_TYPES.has(msg.type)) return
        if (msg.sender === this.me) return // our own echo, already applied
        if (this._state !== "open") return // terminal — ignore trailing traffic

        switch (msg.type) {
            case "offer":
            case "counter": {
                const terms = (msg.body as RfqProposalBody)?.terms
                const proposal: StandingProposal = {
                    sequence: msg.sequence,
                    sender: msg.sender,
                    terms,
                }
                this.proposals.set(msg.sequence, proposal)
                this._standing = proposal
                this.onProposal?.(proposal)
                break
            }
            case "accept": {
                const seq = (msg.body as RfqAcceptBody)?.acceptedSequence
                const accepted = this.proposals.get(seq)
                if (!accepted)
                    throw new Error(
                        `RfqSession: accept references unknown proposal sequence ${seq}`,
                    )
                this.settle({
                    state: "accepted",
                    agreedTerms: accepted.terms,
                    acceptedSequence: seq,
                })
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

    private async proposeOutgoing(
        type: "offer" | "counter",
        terms: unknown,
        repliesTo?: number,
    ): Promise<ChannelMessage> {
        const body: RfqProposalBody = { terms }
        const msg = await this.sendFn({ type, body, repliesTo })
        const proposal: StandingProposal = {
            sequence: msg.sequence,
            sender: this.me,
            terms,
        }
        this.proposals.set(msg.sequence, proposal)
        this._standing = proposal
        this.onProposal?.(proposal)
        return msg
    }

    private settle(outcome: RfqOutcome): void {
        this._state = outcome.state
        this._outcome = outcome
        this.onStateChange?.(outcome)
    }

    private assertOpen(action: string): void {
        if (this._state !== "open")
            throw new Error(
                `RfqSession: cannot ${action} — negotiation is ${this._state}`,
            )
    }
}
