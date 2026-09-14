import type { ClaimReference } from "@/identity/cci"

/**
 * One party's co-signature over the agreement's canonical bytes. Versioned
 * for forward compatibility (e.g. a PQC swap-out) without breaking the
 * document layout — same contract as the channel/transcript signatures.
 */
export interface AgreementSignature {
    sigVersion: "1"
    signer: ClaimReference
    signature: string
}

/**
 * DACS-3 WI-D — the committed `AgreementDocument`: what the parties actually
 * agreed, co-signed by every one of them with the key controlling their CCI
 * primary claim. Only its hash goes on-chain (the anchor); the document itself
 * stays in the channel.
 *
 * The invariant this exists to carry (SR-4 brief §0): the party that signed
 * in-channel is the SAME CCI identity that co-signs this document. `channelId`
 * binds the agreement to the session it was negotiated in, and
 * `verifyAgreement({ members })` checks the signer set against that session's
 * membership.
 *
 * SPEC NOTE: the wire schema is fixed by DACS-3 §8.5.1, which is not present in
 * this repo. The invariants (co-signed by all parties, CCI primary keys,
 * domain-separated, hash-anchored) come from the SR-4 brief and are implemented
 * faithfully; the exact field names should be reconciled against §8.5.1 before
 * this is treated as spec-final.
 */
export interface AgreementDocument {
    agreementVersion: "1"
    /** The negotiation session this was agreed in — unique per session (CH-6). */
    channelId: string
    /** Every party that must co-sign. All of them, or the document is not committed. */
    parties: ClaimReference[]
    /**
     * The agreed terms. Deliberately opaque — exactly as `negotiate-rfq` leaves
     * its `terms` impl-defined. DACS-Pay puts its FinancedAgreement here.
     */
    body: unknown
    agreedAt: number
    /** Optional back-references into the negotiation that produced this. */
    refs?: {
        /** Sequence of the channel message that was accepted. */
        acceptedSequence?: number
        /** Hash of the transcript backing it (see the anchor helpers). */
        transcriptHash?: string
    }
    signatures: AgreementSignature[]
}

export type UnsignedAgreementDocument = Omit<AgreementDocument, "signatures">
