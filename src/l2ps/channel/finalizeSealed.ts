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
import {
    commitmentHex,
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

    // The transcript must actually back the reported outcome — not merely
    // contain a reveal and *a* commit from the same sender, but a reveal that
    // cryptographically OPENS that commit. `sealed` and `session` are separate
    // structural inputs, so a mismatched or mocked pair could otherwise pair a
    // real reveal sequence with an unrelated commit and still produce a
    // transcript that verifies while proving nothing about the sealed bid.
    const messages = opts.session.messages()
    const commitOf = (participant: ClaimReference): ChannelMessage | undefined =>
        messages.find(
            m => m.type === "sealed-envelope-commit" && m.sender === participant,
        )

    const outcome = opts.sealed.outcome()

    for (const reveal of outcome.reveals) {
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
    }

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
    if (
        opts.sealed.state === "closed" &&
        outcome.reveals.length === 0 &&
        (outcome.disqualified?.length ?? 0) === 0
    )
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
