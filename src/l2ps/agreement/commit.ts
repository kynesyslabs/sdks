/**
 * Commit an accepted negotiation into a WI-D `AgreementDocument`.
 *
 * `finalizeRfq` takes an accepted RFQ to a signed transcript and its anchor.
 * Nothing took it to the thing the parties are actually bound by — the
 * committed agreement. This is that step, and it is where the SR-4 brief's §0
 * invariant is made structural rather than aspirational: the document's parties
 * ARE the channel's members, and the terms ARE the ones this session accepted,
 * so the identity that signed in-channel is necessarily the identity that
 * co-signs the commitment.
 *
 * The RFQ/session surfaces are structural (mirroring `finalize.ts`) so this
 * composes with anything that reports the same shape.
 */

import type { ClaimReference } from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type { ChannelMessage } from "@/l2ps/channel/types"
import type { AgreementDocument } from "@/l2ps/agreement/types"
import { coSignAgreement } from "@/l2ps/agreement/agreement"

/** Minimal RFQ outcome surface — structural for testability. */
export interface CommittableOutcome {
    state: string
    agreedTerms?: unknown
    acceptedSequence?: number
}

export interface CommittableRfq {
    readonly state: string
    outcome(): CommittableOutcome
}

/** Minimal ChannelSession surface — structural for testability. */
export interface CommittableSession {
    readonly channelId: string
    readonly members: ReadonlyArray<ClaimReference>
    messages(): ReadonlyArray<ChannelMessage>
}

export interface CommitRfqOpts {
    rfq: CommittableRfq
    session: CommittableSession
    /**
     * Every member, with a connected Demos to sign. An agreement missing any
     * member's signature is not committed — `verifyAgreement` rejects it — so
     * this must cover the full membership, exactly once each.
     */
    signers: Array<{ claim: ClaimReference; demos: Demos }>
    agreedAt?: number
    /** Hash of the transcript backing this agreement, if one was exported. */
    transcriptHash?: string
}

/**
 * Turn an accepted RFQ into the committed, co-signed `AgreementDocument`.
 *
 * Refuses anything but an accepted negotiation whose accepted proposal this
 * session actually carries, and (via `coSignAgreement`, since the parties ARE
 * the members) refuses any signer set that is not exactly the membership, once
 * each — a document the whole channel didn't sign would breach §0 the moment it
 * was verified, so it is never minted.
 *
 * @param opts.rfq - The accepted negotiation.
 * @param opts.session - The channel session it was negotiated in.
 * @param opts.signers - One connected signer per channel member.
 * @param opts.agreedAt - Unix ms; defaults to now.
 * @param opts.transcriptHash - Optional back-reference to the exported transcript.
 * @returns The committed document.
 * @throws If the negotiation is not accepted, its outcome disagrees with its
 * state, the accepted proposal is not in this session's transcript, or the
 * signer set is not the membership.
 */
export async function commitRfq(opts: CommitRfqOpts): Promise<AgreementDocument> {
    const outcome = opts.rfq.outcome()

    // Both are read off the same object, but they are separate reads on a
    // structural interface: a stale or inconsistent implementation could report
    // an accepted state alongside a rejected outcome. Commit only when they agree.
    if (opts.rfq.state !== "accepted" || outcome.state !== "accepted")
        throw new Error(
            `commitRfq: negotiation is state="${opts.rfq.state}" / outcome="${outcome.state}", not accepted — ` +
                "only an agreed RFQ commits to an AgreementDocument",
        )

    const acceptedSequence = outcome.acceptedSequence
    if (acceptedSequence === undefined)
        throw new Error(
            "commitRfq: accepted outcome carries no acceptedSequence — cannot bind the agreement to the proposal",
        )

    // The RFQ state machine carries no channelId, so nothing stops an accepted
    // RFQ from one channel being paired with another channel's session — which
    // would mint a document naming a channel that never agreed those terms.
    // Bind them the way finalizeRfq does: this session must actually carry the
    // accepted proposal and the accept that points at it.
    const messages = opts.session.messages()
    const hasProposal = messages.some((m) => m.sequence === acceptedSequence)
    const hasAccept = messages.some(
        (m) =>
            m.type === "accept" &&
            (m.body as { acceptedSequence?: number } | undefined)?.acceptedSequence ===
                acceptedSequence,
    )
    if (!hasProposal || !hasAccept)
        throw new Error(
            `commitRfq: this session does not carry the accepted proposal (seq ${acceptedSequence}) ` +
                "and its matching accept — the RFQ belongs to a different channel",
        )

    return coSignAgreement({
        channelId: opts.session.channelId,
        // The parties ARE the membership — that is the invariant, not a copy of
        // it. coSignAgreement then enforces exactly one signer per party, which
        // here IS the §0 check, with claim normalisation applied.
        parties: [...opts.session.members],
        body: outcome.agreedTerms,
        signers: opts.signers,
        agreedAt: opts.agreedAt,
        refs: {
            acceptedSequence,
            ...(opts.transcriptHash && { transcriptHash: opts.transcriptHash }),
        },
    })
}
