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
}

const RFQ_TYPES: ReadonlySet<ChannelMessageType> = new Set<ChannelMessageType>([
    "offer",
    "counter",
    "accept",
    "reject",
    "abort",
])

export class RfqSession {
    private readonly channelId: string | undefined
    private readonly members: ReadonlyArray<ClaimReference> | undefined
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
        const msg = await this.sendFn({
            type: "accept",
            body,
            repliesTo: accepted.sequence,
        })
        this.settleAccepted(accepted, msg)
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
        if (sameRfqMembers([msg.sender], [this.me])) return // own echo, already applied
        if (this._state !== "open") return // terminal — ignore trailing traffic
        if (this.channelId && msg.channelId !== this.channelId)
            throw new Error("RfqSession: message changed channel")
        if (this.members && !isRfqMember(this.members, msg.sender))
            throw new Error(`RfqSession: sender "${msg.sender}" is not a member`)

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
        const msg = await this.sendFn({ type, body, repliesTo })
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

    private assertOpen(action: string): void {
        if (this._state !== "open")
            throw new Error(
                `RfqSession: cannot ${action} — negotiation is ${this._state}`,
            )
    }
}
