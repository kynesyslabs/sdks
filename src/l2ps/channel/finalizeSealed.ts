/**
 * SR-4 — finalise a negotiate-sealed-envelope session: once the auction has
 * closed, export the signed channel transcript and (per disclosure policy,
 * DACS-3 §8.7) anchor an encrypted copy, returning the `channelTranscriptRef`.
 *
 * The sealed-envelope analogue of `finalizeRfq`. Where RFQ finalises on an
 * `accepted` proposal, this finalises on a `closed` auction — the terminal
 * state in which every committer has been accounted for (validly opened or
 * disqualified). The orchestration is identical from `exportTranscript`
 * onward, so the anchor call is injectable for the same reason: unit-testing
 * without deploying an SR-2 storage program.
 *
 * A closed auction with no valid reveals (everyone welched) is still a
 * finalisable terminal state — anchoring it produces a portable proof that
 * these members committed and failed to open, which is exactly what a
 * reputation layer needs. Only `aborted` and the non-terminal phases are
 * refused.
 */

import type { Demos } from "../../websdk"
import type { ClaimReference } from "../../identity/cci"
import type L2PS from "../l2ps"
import type {
    AnchorEncryptedTranscriptOpts,
    AttestationRef,
    TranscriptDisclosurePolicy,
} from "../anchor"
import { anchorEncryptedTranscript } from "../anchor"
import { exportTranscript } from "./transcript"
import { verifyChannelMessage } from "./envelope"
import type { ChannelTranscript } from "./types"
import type { ChannelSessionView } from "./finalize"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import {
    commitmentHex,
    selectWinner,
    type RevealedBid,
    type SealedCommitBody,
    type SealedEnvelopeOutcome,
    type SealedEnvelopeState,
    type SealedRevealBody,
} from "./sealedEnvelope"
import type { ChannelMessage } from "./types"

/** Minimal SealedEnvelopeSession surface — structural for testability. */
export interface SealedEnvelopeLike {
    readonly state: SealedEnvelopeState
    outcome(): SealedEnvelopeOutcome
}

export interface FinalizeSealedEnvelopeOpts {
    sealed: SealedEnvelopeLike
    session: ChannelSessionView
    /** This party's CCI claim (signs the transcript); must be a member. */
    signer: ClaimReference
    demos: Demos
    /** Required when the policy actually anchors (not for `none`). */
    l2ps?: L2PS
    policy: TranscriptDisclosurePolicy
    /** Needed to anchor under `encrypted-anchored-recommended`. */
    consent?: boolean
    /**
     * The winner rule the session was built with. The outcome's winner is
     * recomputed from the transcript's reveals with it and must match; an
     * outcome that names a winner cannot be finalised without it, because the
     * ranking would otherwise be taken on trust.
     */
    compareBids?: (a: RevealedBid, b: RevealedBid) => number
    /**
     * Injectable anchor implementation; defaults to the real
     * `anchorEncryptedTranscript`. Tests pass a fake to avoid deploying a
     * storage program.
     */
    anchor?: (
        opts: AnchorEncryptedTranscriptOpts,
    ) => Promise<AttestationRef | null>
}

export interface SealedEnvelopeFinalizeResult {
    /** The signed, ordered transcript (always produced). */
    transcript: ChannelTranscript
    /**
     * The anchored attestation reference, or null when the policy did not
     * anchor (`none`, or `recommended` without consent).
     */
    channelTranscriptRef: AttestationRef | null
}

/** Structural equality of two JSON bids; a non-JSON value is never equal. */
function sameValue(a: unknown, b: unknown): boolean {
    try {
        return canonicalJSONStringify(a) === canonicalJSONStringify(b)
    } catch {
        return false
    }
}

export async function finalizeSealedEnvelope(
    opts: FinalizeSealedEnvelopeOpts,
): Promise<SealedEnvelopeFinalizeResult> {
    if (opts.sealed.state !== "closed") {
        throw new Error(
            `finalizeSealedEnvelope: auction is "${opts.sealed.state}", not "closed" — ` +
                "only a resolved auction produces a transcript anchor",
        )
    }

    // Same reason as finalizeRfq: a non-member signer yields a transcript that
    // later fails `verifyTranscript` (signer ∉ members). Catch it here.
    if (!opts.session.members.includes(opts.signer)) {
        throw new Error(
            `finalizeSealedEnvelope: signer "${opts.signer}" is not a channel member — ` +
                "the transcript signature would fail verification",
        )
    }

    // The transcript must actually back the reported outcome — not merely
    // contain a reveal and *a* commit from the same sender, but a reveal that
    // cryptographically OPENS that commit. `sealed` and `session` are separate
    // structural inputs, so a mismatched or mocked pair could otherwise pair a
    // real reveal sequence with an unrelated commit and still produce a
    // transcript that verifies while proving nothing about the sealed bid.
    const messages = opts.session.messages()

    // The transcript is co-signed and anchored as evidence, and every check
    // below reads message bodies — so a forged or foreign message must be
    // refused before any of them is believed. `session` is a structural input
    // and carries no guarantee that its messages were ever verified.
    let lastSeq = 0
    for (const m of messages) {
        if (m.channelId !== opts.session.channelId)
            throw new Error(
                `finalizeSealedEnvelope: message seq ${m.sequence} belongs to channel "${m.channelId}", ` +
                    `not "${opts.session.channelId}"`,
            )
        if (!opts.session.members.includes(m.sender))
            throw new Error(
                `finalizeSealedEnvelope: message seq ${m.sequence} is from non-member ${m.sender}`,
            )
        if (!verifyChannelMessage(m))
            throw new Error(
                `finalizeSealedEnvelope: message seq ${m.sequence} from ${m.sender} has an ` +
                    "invalid signature — refusing to sign or anchor it",
            )
        if (m.sequence <= lastSeq)
            throw new Error(
                `finalizeSealedEnvelope: message seq ${m.sequence} is not after seq ${lastSeq} — ` +
                    "the transcript is not strictly ordered",
            )
        lastSeq = m.sequence
    }

    // One sealed auction per channel: the session carries no auction id or
    // sequence range, so the channel IS the auction's scope. A second commit
    // from the same sender would be a second auction (or a replaced bid) whose
    // reveal could be paired with whichever commit suits the outcome — reject it
    // rather than guess which one counts.
    const commits = new Map<ClaimReference, ChannelMessage>()
    let lastCommitSeq = 0
    let firstRevealSeq = Infinity
    for (const m of messages) {
        if (m.type === "sealed-envelope-commit") {
            if (commits.has(m.sender))
                throw new Error(
                    `finalizeSealedEnvelope: ${m.sender} committed more than once — ` +
                        "a channel carries a single sealed auction",
                )
            commits.set(m.sender, m)
            lastCommitSeq = Math.max(lastCommitSeq, m.sequence)
        } else if (m.type === "sealed-envelope-reveal") {
            firstRevealSeq = Math.min(firstRevealSeq, m.sequence)
        }
    }
    // The fairness rule: no bid may be opened while another is still unsealed.
    if (firstRevealSeq <= lastCommitSeq)
        throw new Error(
            `finalizeSealedEnvelope: a reveal (seq ${firstRevealSeq}) does not come after every ` +
                `commit (last at seq ${lastCommitSeq}) — bids were opened before all were sealed`,
        )
    const commitOf = (participant: ClaimReference): ChannelMessage | undefined =>
        commits.get(participant)

    const outcome = opts.sealed.outcome()

    // Bids as the transcript proves them, not as the outcome reports them.
    const verified: RevealedBid[] = []
    const seenRevealers = new Set<ClaimReference>()

    for (const reveal of outcome.reveals) {
        if (seenRevealers.has(reveal.participant))
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant} appears twice in the reported reveals`,
            )
        seenRevealers.add(reveal.participant)
        const revealMsg = messages.find(
            m =>
                m.sequence === reveal.sequence &&
                m.type === "sealed-envelope-reveal" &&
                m.sender === reveal.participant,
        )
        const commitMsg = commitOf(reveal.participant)
        if (!revealMsg || !commitMsg)
            throw new Error(
                `finalizeSealedEnvelope: transcript does not contain ${reveal.participant}'s ` +
                    `commit and its reveal (seq ${reveal.sequence}) — session mismatch`,
            )
        const { bid, salt } = (revealMsg.body as SealedRevealBody) ?? {}
        const { commitment } = (commitMsg.body as SealedCommitBody) ?? {}
        let opens = false
        try {
            opens = typeof salt === "string" && commitmentHex(bid, salt) === commitment
        } catch {
            opens = false
        }
        if (!opens)
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant}'s reveal (seq ${reveal.sequence}) ` +
                    "does not open the commit it is bound to — session mismatch",
            )
        // The opening is proven against the commit, so the reported bid must be
        // the opened one — otherwise the outcome could rank a bid nobody sealed.
        if (!sameValue(reveal.bid, bid))
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant}'s reported bid differs from the bid ` +
                    `revealed at seq ${reveal.sequence} — session mismatch`,
            )
        verified.push({ participant: reveal.participant, bid, sequence: reveal.sequence })
    }

    if (outcome.winner !== undefined || outcome.winningBid !== undefined) {
        if (!opts.compareBids)
            throw new Error(
                "finalizeSealedEnvelope: outcome names a winner but no compareBids was given — " +
                    "the ranking cannot be verified against the transcript",
            )
    }
    if (opts.compareBids) {
        const expected = selectWinner(verified, opts.compareBids)
        const matches = expected
            ? expected.participant === outcome.winner &&
              sameValue(expected.bid, outcome.winningBid)
            : outcome.winner === undefined && outcome.winningBid === undefined
        if (!matches)
            throw new Error(
                "finalizeSealedEnvelope: reported winner / winning bid does not match the " +
                    "transcript's revealed bids — session mismatch",
            )
    }

    // Every sealed bid in the record must be accounted for. Without this, an
    // outcome could simply leave a committer out and crown a winner from the
    // bidders that remain.
    const accounted = new Set<ClaimReference>([
        ...outcome.reveals.map(r => r.participant),
        ...(outcome.disqualified ?? []),
    ])
    for (const committer of commits.keys())
        if (!accounted.has(committer))
            throw new Error(
                `finalizeSealedEnvelope: ${committer} committed but is neither revealed nor ` +
                    "disqualified in the outcome — session mismatch",
            )

    // An all-defaulted auction's evidence IS the commits: every disqualified
    // participant committed and then failed to open. Without their commits in
    // the record, a fabricated `{state:"closed", reveals:[]}` would export a
    // transcript that proves nothing — so require the commits that back them.
    for (const participant of outcome.disqualified ?? []) {
        if (!commitOf(participant))
            throw new Error(
                `finalizeSealedEnvelope: disqualified participant ${participant} has no commit ` +
                    "in the transcript — nothing backs the default",
            )
    }

    // A closed auction with neither a valid reveal nor a disqualified committer
    // has no bids to anchor; refuse rather than sign an empty record.
    if (outcome.reveals.length === 0 && (outcome.disqualified?.length ?? 0) === 0)
        throw new Error(
            "finalizeSealedEnvelope: closed auction has no reveals and no disqualified " +
                "committers — there is nothing to anchor",
        )

    const transcript = await exportTranscript({
        channelId: opts.session.channelId,
        members: [...opts.session.members],
        messages,
        signers: [{ claim: opts.signer, demos: opts.demos }],
    })

    // §8.7 policy semantics — identical to finalizeRfq.
    const willAnchor =
        opts.policy === "encrypted-anchored-required" ||
        (opts.policy === "encrypted-anchored-recommended" && !!opts.consent)
    if (!willAnchor) {
        return { transcript, channelTranscriptRef: null }
    }

    if (!opts.l2ps) {
        throw new Error(
            `finalizeSealedEnvelope: policy "${opts.policy}" requires an L2PS instance to encrypt the transcript`,
        )
    }

    const anchorFn = opts.anchor ?? anchorEncryptedTranscript
    const ref = await anchorFn({
        transcript,
        l2ps: opts.l2ps,
        demos: opts.demos,
        signer: opts.signer,
        policy: opts.policy,
        consent: opts.consent,
    })

    if (opts.policy === "encrypted-anchored-required" && !ref) {
        throw new Error(
            "finalizeSealedEnvelope: policy is 'encrypted-anchored-required' but anchoring " +
                "produced no attestation — phase fails",
        )
    }

    return { transcript, channelTranscriptRef: ref }
}
