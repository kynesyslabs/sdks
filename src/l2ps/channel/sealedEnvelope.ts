/**
 * SR-4 — `negotiate-sealed-envelope` phase logic (DACS-3 §8.4.3).
 *
 * A sealed-bid negotiation runs in two phases. In the **commit** phase each
 * participant broadcasts a hiding commitment to its bid; in the **reveal**
 * phase it opens that commitment. The point is fairness: because every bid is
 * locked before any is opened, no participant can see another's number and
 * shade its own by a dollar. The L2PS channel already keeps the traffic
 * private from non-members (CH-2); the commitment keeps a bid private from the
 * *other members* until reveal.
 *
 * Like `RfqSession`, this is a pure protocol state machine — it moves no
 * bytes. The caller wires `send` to a transport and feeds channel-verified
 * envelopes to `onIncoming`; by then the channel layer has checked the
 * signature, `sender ∈ members`, the channelId, and monotonic sequence, so
 * this layer only enforces the commit/reveal rules.
 *
 * SPEC NOTE: §8.4.3 fixes the sealed-envelope body schema, but that section
 * of DACS-3-NEGOTIATE.md was not available when this was written. The
 * commit/reveal *mechanism* (hash-commit then salted-open) is unambiguous and
 * implemented faithfully here; the exact wire field names and the
 * `dacs-sealed-envelope:v1:` domain string below should be reconciled against
 * §8.4.3 before this is treated as spec-final. The commitment is a hiding hash,
 * not a channel signature — the envelope signature already authenticates the
 * message.
 */

import { sha256 } from "@noble/hashes/sha2"
import { randomBytes } from "@noble/hashes/utils"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { bytesToHex } from "../utils/hex"
import type { ChannelMessage, ChannelMessageType } from "./types"
import type { ClaimReference } from "../../identity/cci"

/** Domain-separates the bid commitment from every other hash in the system. */
export const SEALED_ENVELOPE_DOMAIN_PREFIX = "dacs-sealed-envelope:v1:"

/**
 * The hiding commitment to a bid: `sha256(domain || JCS({ bid, salt }))`, hex.
 *
 * The salt is what makes it hiding — without it a low-entropy bid (a round
 * dollar amount) could be recovered by hashing candidates. It must be fresh
 * per commitment and high-entropy; `SealedEnvelopeSession` generates 32 random
 * bytes. Recomputing this from a reveal and comparing to the commit is the
 * whole anti-cheat check: it binds the revealer to the exact bid it sealed.
 */
export function commitmentHex(bid: unknown, salt: string): string {
    const canonical = canonicalJSONStringify({ bid, salt })
    return bytesToHex(
        sha256(new TextEncoder().encode(SEALED_ENVELOPE_DOMAIN_PREFIX + canonical)),
    )
}

/** Body of a `sealed-envelope-commit`. */
export interface SealedCommitBody {
    commitment: string
}
/** Body of a `sealed-envelope-reveal`. */
export interface SealedRevealBody {
    bid: unknown
    salt: string
}
/** Body of an `abort`. */
export interface SealedAbortBody {
    reason?: string
}

export type SealedEnvelopeState = "commit" | "reveal" | "closed" | "aborted"

/** A commitment on record, before its bid is known. */
export interface SealedCommitment {
    participant: ClaimReference
    commitment: string
    sequence: number
}

/** A reveal whose bid matched its commitment. */
export interface RevealedBid {
    participant: ClaimReference
    bid: unknown
    sequence: number
}

export interface SealedEnvelopeOutcome {
    state: SealedEnvelopeState
    /** Valid reveals (commitment matched), in the order revealed. */
    reveals: RevealedBid[]
    /**
     * Participants who committed but, by the time the session closed, either
     * never revealed or revealed a bid that did not match their commitment.
     * A defaulting bidder is visible, not silently dropped.
     */
    disqualified: ClaimReference[]
    /** Set when a `compareBids` comparator was supplied and ≥1 valid reveal. */
    winner?: ClaimReference
    winningBid?: unknown
    /** Reason for an abort, if given. */
    reason?: string
}

export interface SealedEnvelopeSessionOpts {
    /** This party's CCI primary claim. */
    me: ClaimReference
    /**
     * The fixed bidder set for this auction (CH-1). The commit phase closes
     * automatically once every one of these has committed; `me` must be in it.
     */
    participants: ClaimReference[]
    /**
     * Delivers a signed channel message (wire to the transport's send).
     * Returns the signed envelope so the session can record its sequence.
     */
    send: (opts: {
        type: ChannelMessageType
        body: unknown
        repliesTo?: number
    }) => Promise<ChannelMessage>
    /**
     * Optional winner rule over valid reveals. Positive → `a` beats `b`
     * (highest wins); the session picks the maximum. Ties resolve to the
     * earlier-revealed bid. Absent → no winner is chosen; the caller ranks
     * `outcome.reveals` itself.
     */
    compareBids?: (a: RevealedBid, b: RevealedBid) => number
    /** Fired on every phase/state transition. */
    onStateChange?: (outcome: SealedEnvelopeOutcome) => void
    /** Fired when the commit phase closes and reveals may begin. */
    onRevealPhase?: () => void
}

/** Non-terminal-state message types this session acts on. */
const SEALED_TYPES: ReadonlySet<ChannelMessageType> = new Set<ChannelMessageType>([
    "sealed-envelope-commit",
    "sealed-envelope-reveal",
    "abort",
])

export class SealedEnvelopeSession {
    private readonly me: ClaimReference
    private readonly participants: ReadonlyArray<ClaimReference>
    private readonly sendFn: SealedEnvelopeSessionOpts["send"]
    private readonly compareBids?: SealedEnvelopeSessionOpts["compareBids"]
    private readonly onStateChange?: (o: SealedEnvelopeOutcome) => void
    private readonly onRevealPhase?: () => void

    private _state: SealedEnvelopeState = "commit"
    private readonly commits = new Map<ClaimReference, SealedCommitment>()
    private readonly reveals = new Map<ClaimReference, RevealedBid>()
    /** My own sealed bid, kept between committing and revealing it. */
    private mySealed: { bid: unknown; salt: string } | null = null

    constructor(opts: SealedEnvelopeSessionOpts) {
        if (!opts.participants?.length)
            throw new Error("SealedEnvelopeSession: participants required")
        if (!opts.participants.includes(opts.me))
            throw new Error(
                `SealedEnvelopeSession: me (${opts.me}) is not a participant`,
            )
        this.me = opts.me
        this.participants = [...opts.participants]
        this.sendFn = opts.send
        this.compareBids = opts.compareBids
        this.onStateChange = opts.onStateChange
        this.onRevealPhase = opts.onRevealPhase
    }

    get state(): SealedEnvelopeState {
        return this._state
    }
    /** Commitments on record so far (bids still hidden). */
    commitments(): ReadonlyArray<SealedCommitment> {
        return [...this.commits.values()]
    }
    outcome(): SealedEnvelopeOutcome {
        return this.buildOutcome()
    }

    /** Commit to a bid — commit phase only, once per participant. */
    async commit(bid: unknown): Promise<ChannelMessage> {
        if (this._state !== "commit")
            throw new Error(
                `SealedEnvelopeSession: cannot commit — phase is ${this._state}`,
            )
        if (this.commits.has(this.me))
            throw new Error("SealedEnvelopeSession: already committed")

        const salt = bytesToHex(randomBytes(32))
        const commitment = commitmentHex(bid, salt)
        const body: SealedCommitBody = { commitment }
        const msg = await this.sendFn({ type: "sealed-envelope-commit", body })
        // Stash the opening locally; only its hash went on the wire.
        this.mySealed = { bid, salt }
        this.recordCommit(this.me, commitment, msg.sequence)
        return msg
    }

    /** Open my committed bid — reveal phase only. */
    async reveal(): Promise<ChannelMessage> {
        if (this._state !== "reveal")
            throw new Error(
                `SealedEnvelopeSession: cannot reveal — phase is ${this._state}`,
            )
        if (!this.mySealed)
            throw new Error("SealedEnvelopeSession: nothing to reveal — never committed")
        if (this.reveals.has(this.me))
            throw new Error("SealedEnvelopeSession: already revealed")

        const body: SealedRevealBody = {
            bid: this.mySealed.bid,
            salt: this.mySealed.salt,
        }
        const msg = await this.sendFn({ type: "sealed-envelope-reveal", body })
        this.recordReveal(this.me, this.mySealed.bid, msg.sequence)
        return msg
    }

    /**
     * Close the commit phase early without waiting for every participant —
     * the deadline path. Whoever has not committed is simply excluded from the
     * auction (they never bid); the committed set is locked and reveals begin.
     */
    closeCommitPhase(): void {
        if (this._state !== "commit")
            throw new Error(
                `SealedEnvelopeSession: not in commit phase (${this._state})`,
            )
        this.enterRevealPhase()
    }

    /**
     * Close the auction — the deadline path for the reveal phase. Any
     * participant who committed but has not revealed is disqualified, and the
     * winner (if a comparator was given) is drawn from the valid reveals.
     */
    close(): SealedEnvelopeOutcome {
        if (this._state !== "reveal")
            throw new Error(
                `SealedEnvelopeSession: cannot close — phase is ${this._state}`,
            )
        this.settle("closed")
        return this.buildOutcome()
    }

    /** Abort the negotiation — terminal (CH-5). */
    async abort(reason?: string): Promise<ChannelMessage> {
        if (this._state === "closed" || this._state === "aborted")
            throw new Error(
                `SealedEnvelopeSession: cannot abort — already ${this._state}`,
            )
        const body: SealedAbortBody = reason ? { reason } : {}
        const msg = await this.sendFn({ type: "abort", body })
        this._reason = reason
        this.settle("aborted")
        return msg
    }

    /**
     * Feed a channel-verified inbound message. No-op for unrelated types, our
     * own echo, or traffic after a terminal state. Throws on a protocol
     * violation the channel layer cannot catch — the decisive one being a
     * reveal that arrives while bids are still being committed, which would let
     * a laggard adapt its bid to a number it should not yet be able to see.
     */
    onIncoming(msg: ChannelMessage): void {
        if (!SEALED_TYPES.has(msg.type)) return
        if (msg.sender === this.me) return // our own echo, already applied
        if (this._state === "closed" || this._state === "aborted") return

        switch (msg.type) {
            case "sealed-envelope-commit": {
                if (this._state !== "commit")
                    throw new Error(
                        `SealedEnvelopeSession: commit from ${msg.sender} after commit phase closed`,
                    )
                if (!this.participants.includes(msg.sender))
                    throw new Error(
                        `SealedEnvelopeSession: commit from non-participant ${msg.sender}`,
                    )
                if (this.commits.has(msg.sender))
                    throw new Error(
                        `SealedEnvelopeSession: duplicate commit from ${msg.sender}`,
                    )
                const { commitment } = (msg.body as SealedCommitBody) ?? {}
                if (typeof commitment !== "string" || !commitment)
                    throw new Error(
                        `SealedEnvelopeSession: commit from ${msg.sender} carries no commitment`,
                    )
                this.recordCommit(msg.sender, commitment, msg.sequence)
                break
            }
            case "sealed-envelope-reveal": {
                // The core fairness rule: a reveal is only legal once every
                // bid is locked. Before that, an un-committed party could see
                // this number and set its own accordingly.
                if (this._state !== "reveal")
                    throw new Error(
                        `SealedEnvelopeSession: reveal from ${msg.sender} before the commit phase closed`,
                    )
                const commit = this.commits.get(msg.sender)
                if (!commit)
                    throw new Error(
                        `SealedEnvelopeSession: reveal from ${msg.sender} who never committed`,
                    )
                if (this.reveals.has(msg.sender))
                    throw new Error(
                        `SealedEnvelopeSession: duplicate reveal from ${msg.sender}`,
                    )
                const { bid, salt } = (msg.body as SealedRevealBody) ?? {}
                if (typeof salt !== "string" || !salt)
                    throw new Error(
                        `SealedEnvelopeSession: reveal from ${msg.sender} carries no salt`,
                    )
                // A reveal that does not reproduce the commitment is a bid the
                // sender did not seal. Disqualify — do not throw: one cheater
                // must not sink an otherwise-valid auction.
                if (commitmentHex(bid, salt) !== commit.commitment) {
                    this._badReveals.add(msg.sender)
                    this.maybeAutoClose()
                    break
                }
                this.recordReveal(msg.sender, bid, msg.sequence)
                break
            }
            case "abort": {
                this._reason = (msg.body as SealedAbortBody)?.reason
                this.settle("aborted")
                break
            }
        }
    }

    // ── internals ──────────────────────────────────────────────────────────

    private _reason: string | undefined
    /** Committers whose reveal did not match — disqualified, not fatal. */
    private readonly _badReveals = new Set<ClaimReference>()

    private recordCommit(
        participant: ClaimReference,
        commitment: string,
        sequence: number,
    ): void {
        this.commits.set(participant, { participant, commitment, sequence })
        // Everyone in the auction has sealed a bid — open the reveal phase.
        if (this._state === "commit" && this.commits.size === this.participants.length)
            this.enterRevealPhase()
        else this.emitStateChange()
    }

    private recordReveal(
        participant: ClaimReference,
        bid: unknown,
        sequence: number,
    ): void {
        this.reveals.set(participant, { participant, bid, sequence })
        this.maybeAutoClose()
    }

    /** Close once every committer is accounted for — validly opened or not. */
    private maybeAutoClose(): void {
        if (
            this._state === "reveal" &&
            this.reveals.size + this._badReveals.size === this.commits.size
        )
            this.settle("closed")
        else this.emitStateChange()
    }

    private enterRevealPhase(): void {
        this._state = "reveal"
        this.onRevealPhase?.()
        this.emitStateChange()
    }

    private settle(state: "closed" | "aborted"): void {
        this._state = state
        this.emitStateChange()
    }

    private emitStateChange(): void {
        this.onStateChange?.(this.buildOutcome())
    }

    private buildOutcome(): SealedEnvelopeOutcome {
        const reveals = [...this.reveals.values()]
        // A committer is disqualified if it never produced a valid reveal —
        // only meaningful once the auction has closed.
        const disqualified: ClaimReference[] = []
        if (this._state === "closed") {
            for (const p of this.commits.keys())
                if (!this.reveals.has(p)) disqualified.push(p)
        }
        for (const p of this._badReveals) if (!disqualified.includes(p)) disqualified.push(p)

        const outcome: SealedEnvelopeOutcome = {
            state: this._state,
            reveals,
            disqualified,
            reason: this._reason,
        }
        if (this._state === "closed" && this.compareBids && reveals.length) {
            const winner = reveals.reduce((best, r) =>
                this.compareBids!(r, best) > 0 ? r : best,
            )
            outcome.winner = winner.participant
            outcome.winningBid = winner.bid
        }
        return outcome
    }
}
