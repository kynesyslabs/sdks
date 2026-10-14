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
 *
 * The session and the channel transcript are separate inputs, so finalisation
 * trusts neither the outcome nor the messages: it re-derives the auction from
 * the signed transcript and refuses on any disagreement (see
 * `finalizeSealedEnvelope`). Scope and tolerance rules:
 *   - One sealed auction per channel; the channel is the auction's scope.
 *   - The first reveal on the wire closes the commit window. A sender's first
 *     commit before it is binding; a later commit from the same sender, or any
 *     commit after the first reveal, is a straggler and is ignored (it neither
 *     backs a reveal nor has to be accounted for).
 *   - Stray reveals (no binding commit) and repeat reveals are refused, as is
 *     any abort message.
 *   - Every valid opening in the transcript must appear in `outcome.reveals`.
 *     Disqualifying a reveal that arrived after the deadline close would need
 *     an on-wire close marker, which the protocol does not carry yet — until it
 *     does there is no verifiable notion of "late" and the rule is strict.
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

/**
 * Finalise a closed sealed-bid auction. Throws, before anything is signed or
 * anchored, unless the transcript independently backs the session's outcome:
 *
 *  1. the session is `closed` and its outcome reports the same state;
 *  2. the signer is a channel member;
 *  3. every message has the transcript's channel id, a member sender, a valid
 *     signature, and a strictly increasing sequence;
 *  4. no `abort` is present;
 *  5. every reveal has a binding commit and each sender reveals at most once
 *     (late and duplicate commits are ignored, see the module header);
 *  6. each reported reveal is a real reveal message that opens its sender's
 *     binding commit, with the reported bid equal to the opened bid, and no
 *     participant is listed twice;
 *  7. every valid opening in the transcript is reported, and no participant is
 *     both revealed and disqualified;
 *  8. the reported winner and winning bid equal the winner recomputed from the
 *     opened bids with `compareBids` (ties go to the lower sequence). An outcome
 *     that names a winner is refused without `compareBids`, and a session built
 *     without a comparator but finalised with one fails because the expected
 *     winner exists while the outcome names none;
 *  9. every binding committer is revealed or disqualified, each disqualified
 *     participant has a binding commit, and the outcome is not empty.
 *
 * Then it signs the transcript and anchors it per `policy` (DACS-3 §8.7).
 */
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

    // A terminal abort anywhere in the record means the auction did not resolve,
    // whatever the session object says; a closed outcome must not be anchored
    // over it.
    if (messages.some(m => m.type === "abort"))
        throw new Error(
            "finalizeSealedEnvelope: the transcript contains an abort — the auction did not resolve",
        )

    // Scope. The session carries no auction id or sequence range, so the channel
    // IS the auction: one sealed auction per channel. Within it, the first reveal
    // on the wire closes the commit window — a commit sequenced after it, or a
    // repeat commit from the same sender, is a straggler or a replacement. It is
    // ignored rather than fatal: one late message must not let a participant
    // block finalisation of an otherwise-valid auction, and it can never back a
    // reveal (the first commit is the binding one).
    let firstRevealSeq = Infinity
    for (const m of messages)
        if (m.type === "sealed-envelope-reveal")
            firstRevealSeq = Math.min(firstRevealSeq, m.sequence)
    const binding = new Map<ClaimReference, ChannelMessage>()
    for (const m of messages)
        if (
            m.type === "sealed-envelope-commit" &&
            m.sequence < firstRevealSeq &&
            !binding.has(m.sender)
        )
            binding.set(m.sender, m)

    // Reveals, by contrast, are not tolerated when stray: a reveal with no
    // binding commit opens nothing, and a second reveal from one sender would
    // let the outcome pick whichever opening suits it.
    const revealMsgs = new Map<ClaimReference, ChannelMessage>()
    for (const m of messages) {
        if (m.type !== "sealed-envelope-reveal") continue
        if (!binding.has(m.sender))
            throw new Error(
                `finalizeSealedEnvelope: reveal (seq ${m.sequence}) from ${m.sender}, who has no ` +
                    "binding commit in the transcript",
            )
        if (revealMsgs.has(m.sender))
            throw new Error(
                `finalizeSealedEnvelope: ${m.sender} revealed more than once (seq ${m.sequence})`,
            )
        revealMsgs.set(m.sender, m)
    }

    // The openings the transcript itself proves: a reveal that reproduces the
    // sender's binding commitment. Derived here, never taken from the outcome.
    const opened = new Map<ClaimReference, RevealedBid>()
    for (const [participant, revealMsg] of revealMsgs) {
        const { bid, salt } = (revealMsg.body as SealedRevealBody) ?? {}
        const { commitment } = (binding.get(participant)!.body as SealedCommitBody) ?? {}
        let opens = false
        try {
            opens = typeof salt === "string" && commitmentHex(bid, salt) === commitment
        } catch {
            opens = false
        }
        if (opens) opened.set(participant, { participant, bid, sequence: revealMsg.sequence })
    }

    // State, not just reachability: the outcome object must describe the same
    // terminal state the session reports (finalizeRfq does the same).
    const outcome = opts.sealed.outcome()
    if (outcome.state !== opts.sealed.state)
        throw new Error(
            `finalizeSealedEnvelope: outcome state "${outcome.state}" does not match session ` +
                `state "${opts.sealed.state}" — session mismatch`,
        )

    // Bids as the transcript proves them, not as the outcome reports them.
    const verified: RevealedBid[] = []
    const seenRevealers = new Set<ClaimReference>()

    for (const reveal of outcome.reveals) {
        if (seenRevealers.has(reveal.participant))
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant} appears twice in the reported reveals`,
            )
        seenRevealers.add(reveal.participant)
        const revealMsg = revealMsgs.get(reveal.participant)
        if (
            !revealMsg ||
            !binding.has(reveal.participant) ||
            revealMsg.sequence !== reveal.sequence
        )
            throw new Error(
                `finalizeSealedEnvelope: transcript does not contain ${reveal.participant}'s ` +
                    `commit and its reveal (seq ${reveal.sequence}) — session mismatch`,
            )
        const proven = opened.get(reveal.participant)
        if (!proven)
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant}'s reveal (seq ${reveal.sequence}) ` +
                    "does not open the commit it is bound to — session mismatch",
            )
        // The opening is proven against the commit, so the reported bid must be
        // the opened one — otherwise the outcome could rank a bid nobody sealed.
        if (!sameValue(reveal.bid, proven.bid))
            throw new Error(
                `finalizeSealedEnvelope: ${reveal.participant}'s reported bid differs from the bid ` +
                    `revealed at seq ${reveal.sequence} — session mismatch`,
            )
        verified.push(proven)
    }

    // The converse: a valid opening must not be dropped. Listing a genuine
    // revealer as disqualified, or omitting them, would crown a winner from
    // whoever is left. (Disqualifying a reveal that arrived after the close
    // needs an on-wire close marker; none exists yet, so the rule is strict.)
    for (const participant of outcome.disqualified ?? [])
        if (seenRevealers.has(participant))
            throw new Error(
                `finalizeSealedEnvelope: ${participant} is both revealed and disqualified in the outcome`,
            )
    for (const participant of opened.keys())
        if (!seenRevealers.has(participant))
            throw new Error(
                `finalizeSealedEnvelope: ${participant} has a valid reveal in the transcript that ` +
                    "the outcome omits or disqualifies — session mismatch",
            )

    if (outcome.winner !== undefined || outcome.winningBid !== undefined) {
        if (!opts.compareBids)
            throw new Error(
                "finalizeSealedEnvelope: outcome names a winner but no compareBids was given — " +
                    "the ranking cannot be verified against the transcript",
            )
    }
    if (opts.compareBids) {
        let expected: RevealedBid | undefined
        try {
            expected = selectWinner(verified, opts.compareBids)
        } catch {
            throw new Error(
                "finalizeSealedEnvelope: compareBids threw on the transcript's revealed bids — " +
                    "session mismatch",
            )
        }
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
    for (const committer of binding.keys())
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
        if (!binding.has(participant))
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
