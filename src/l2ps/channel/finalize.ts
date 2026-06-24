/**
 * SR-4 WI-C — finalise a negotiate-rfq session: on agreement, export the
 * signed channel transcript and (per disclosure policy, DACS-3 §8.7)
 * anchor an encrypted copy, returning the `channelTranscriptRef` that the
 * negotiate-rfq output carries.
 *
 * This is the orchestration that ties WI-B's terminal state to WI-3's
 * transcript anchor: `exportTranscript` (sign the ordered messages) →
 * `anchorEncryptedTranscript` (encrypt-to-members + SR-2 anchor). Policy
 * semantics (§8.7):
 *   - `none` — transcript stays local; nothing anchored.
 *   - `encrypted-anchored-recommended` — anchor only on explicit consent.
 *   - `encrypted-anchored-required` — MUST anchor; a null result fails
 *     the phase.
 *
 * The anchor call is injectable so the orchestration is unit-tested
 * without a live node (the real anchor deploys an SR-2 storage program).
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
import type { ChannelMessage, ChannelTranscript } from "./types"
import type { RfqOutcome, RfqState } from "./negotiate"

/** Minimal RfqSession surface — structural for testability. */
export interface RfqLike {
    readonly state: RfqState
    outcome(): RfqOutcome
}

/** Minimal ChannelSession surface — structural for testability. */
export interface ChannelSessionView {
    readonly channelId: string
    readonly members: ReadonlyArray<ClaimReference>
    messages(): ReadonlyArray<ChannelMessage>
}

export interface FinalizeRfqOpts {
    rfq: RfqLike
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
     * `anchorEncryptedTranscript`. Tests pass a fake to avoid deploying
     * a storage program.
     */
    anchor?: (
        opts: AnchorEncryptedTranscriptOpts,
    ) => Promise<AttestationRef | null>
}

export interface RfqFinalizeResult {
    /** The signed, ordered transcript (always produced). */
    transcript: ChannelTranscript
    /**
     * The anchored attestation reference, or null when the policy did not
     * anchor (`none`, or `recommended` without consent).
     */
    channelTranscriptRef: AttestationRef | null
}

export async function finalizeRfq(
    opts: FinalizeRfqOpts,
): Promise<RfqFinalizeResult> {
    if (opts.rfq.state !== "accepted") {
        throw new Error(
            `finalizeRfq: negotiation is "${opts.rfq.state}", not "accepted" — ` +
                "only an agreed RFQ produces a transcript anchor",
        )
    }

    // The signer must be a channel member — `exportTranscript` will sign
    // with any demos claim, so a non-member signer produces a transcript
    // that later fails `verifyTranscript` (signer ∉ members). Catch it
    // here rather than emitting a transcript that cannot be verified.
    if (!opts.session.members.includes(opts.signer)) {
        throw new Error(
            `finalizeRfq: signer "${opts.signer}" is not a channel member — ` +
                "the transcript signature would fail verification",
        )
    }

    // The transcript must actually contain the agreed exchange: the
    // accepted proposal and the matching accept that `rfq.outcome()`
    // points at. A stale or mismatched session would otherwise let us
    // export/anchor a transcript that does not back the agreement.
    const outcome = opts.rfq.outcome()
    const acceptedSequence = outcome.acceptedSequence
    if (acceptedSequence === undefined) {
        throw new Error(
            "finalizeRfq: accepted outcome has no acceptedSequence — cannot match transcript",
        )
    }
    const messages = opts.session.messages()
    const hasAcceptedProposal = messages.some(
        m => m.sequence === acceptedSequence,
    )
    const hasAccept = messages.some(
        m =>
            m.type === "accept" &&
            (m.body as { acceptedSequence?: number } | undefined)
                ?.acceptedSequence === acceptedSequence,
    )
    if (!hasAcceptedProposal || !hasAccept) {
        throw new Error(
            `finalizeRfq: session transcript does not contain the accepted proposal ` +
                `(seq ${acceptedSequence}) and its matching accept — session mismatch`,
        )
    }

    const transcript = await exportTranscript({
        channelId: opts.session.channelId,
        members: [...opts.session.members],
        messages,
        signers: [{ claim: opts.signer, demos: opts.demos }],
    })

    // §8.7 `none`: transcript stays local; nothing anchored.
    // §8.7 `recommended` WITHOUT consent: also a no-anchor outcome — it
    // must NOT require an L2PS instance just to take its null-ref branch.
    const willAnchor =
        opts.policy === "encrypted-anchored-required" ||
        (opts.policy === "encrypted-anchored-recommended" && !!opts.consent)
    if (!willAnchor) {
        return { transcript, channelTranscriptRef: null }
    }

    if (!opts.l2ps) {
        throw new Error(
            `finalizeRfq: policy "${opts.policy}" requires an L2PS instance to encrypt the transcript`,
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

    // §8.7: under `required`, the absence of an anchor fails the phase.
    if (opts.policy === "encrypted-anchored-required" && !ref) {
        throw new Error(
            "finalizeRfq: policy is 'encrypted-anchored-required' but anchoring " +
                "produced no attestation — phase fails",
        )
    }

    return { transcript, channelTranscriptRef: ref }
}
