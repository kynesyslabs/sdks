/**
 * Commit an accepted negotiation into a WI-D `AgreementDocument`.
 *
 * `finalizeRfq` takes an accepted RFQ to a signed transcript and its anchor.
 * Nothing took it to the thing the parties are actually bound by — the
 * committed agreement. This is that step, and it is where the SR-4 brief's §0
 * invariant is made structural rather than aspirational: the document's parties
 * ARE the channel's members, and the terms ARE the ones the session accepted,
 * so the identity that signed in-channel is necessarily the identity that
 * co-signs the commitment.
 *
 * The RFQ/session surfaces are structural (mirroring `finalize.ts`) so this
 * composes with anything that reports the same shape.
 */

import type { ClaimReference } from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type { AgreementDocument } from "./types"
import { coSignAgreement } from "./agreement"

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

export interface CommittableSession {
    readonly channelId: string
    readonly members: ReadonlyArray<ClaimReference>
}

export interface CommitRfqOpts {
    rfq: CommittableRfq
    session: CommittableSession
    /**
     * Every member, with a connected Demos to sign. An agreement missing any
     * member's signature is not committed — `verifyAgreement` rejects it — so
     * this must cover the full membership.
     */
    signers: Array<{ claim: ClaimReference; demos: Demos }>
    agreedAt?: number
    /** Hash of the transcript backing this agreement, if one was exported. */
    transcriptHash?: string
}

/**
 * Turn an accepted RFQ into the committed, co-signed `AgreementDocument`.
 *
 * Refuses anything but an accepted negotiation, and refuses a signer set that
 * isn't exactly the channel's membership — a document the whole channel didn't
 * sign would breach §0 the moment it was verified, so it is never minted.
 */
export async function commitRfq(opts: CommitRfqOpts): Promise<AgreementDocument> {
    if (opts.rfq.state !== "accepted")
        throw new Error(
            `commitRfq: negotiation is "${opts.rfq.state}", not "accepted" — ` +
                "only an agreed RFQ commits to an AgreementDocument",
        )

    const outcome = opts.rfq.outcome()
    if (outcome.acceptedSequence === undefined)
        throw new Error(
            "commitRfq: accepted outcome carries no acceptedSequence — cannot bind the agreement to the proposal",
        )

    const members = [...opts.session.members]
    const signing = opts.signers.map((s) => s.claim)
    for (const m of members)
        if (!signing.includes(m))
            throw new Error(
                `commitRfq: no signer for channel member "${m}" — every member must co-sign (§0)`,
            )
    for (const s of signing)
        if (!members.includes(s))
            throw new Error(
                `commitRfq: signer "${s}" is not a member of the channel (§0)`,
            )

    return coSignAgreement({
        channelId: opts.session.channelId,
        // The parties ARE the membership — that is the invariant, not a copy of it.
        parties: members,
        body: outcome.agreedTerms,
        signers: opts.signers,
        agreedAt: opts.agreedAt,
        refs: {
            acceptedSequence: outcome.acceptedSequence,
            ...(opts.transcriptHash && { transcriptHash: opts.transcriptHash }),
        },
    })
}
