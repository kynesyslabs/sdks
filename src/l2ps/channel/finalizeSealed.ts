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
import type { ChannelTranscript } from "./types"
import type { ChannelSessionView } from "./finalize"
import type { SealedEnvelopeOutcome, SealedEnvelopeState } from "./sealedEnvelope"

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

    // The transcript must actually back the reported outcome: every valid
    // revealed bid must have both its reveal message (at the recorded
    // sequence) and the commit it opened present in the record. Otherwise we
    // could export/anchor a transcript that does not support the bids the
    // outcome claims. (Vacuous — and legitimately so — for an all-defaulted
    // auction with no valid reveals.)
    const messages = opts.session.messages()
    for (const reveal of opts.sealed.outcome().reveals) {
        const hasReveal = messages.some(
            m =>
                m.sequence === reveal.sequence &&
                m.type === "sealed-envelope-reveal" &&
                m.sender === reveal.participant,
        )
        const hasCommit = messages.some(
            m =>
                m.type === "sealed-envelope-commit" &&
                m.sender === reveal.participant,
        )
        if (!hasReveal || !hasCommit) {
            throw new Error(
                `finalizeSealedEnvelope: transcript does not contain ${reveal.participant}'s ` +
                    `commit and its reveal (seq ${reveal.sequence}) — session mismatch`,
            )
        }
    }

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
