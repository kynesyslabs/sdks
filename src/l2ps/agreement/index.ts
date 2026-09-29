/**
 * DACS-3 WI-D — the committed `AgreementDocument`.
 *
 * The document the parties actually agreed, co-signed by every one of them with
 * the key controlling their CCI primary claim — the same key that signed
 * in-channel (SR-4 brief §0). Only its hash is anchored on-chain; the document
 * stays in the channel.
 *
 * SPEC NOTE: the wire schema is fixed by DACS-3 §8.5.1, which is not in this
 * repo. The invariants are implemented per the SR-4 brief; reconcile the field
 * names against §8.5.1 before treating this as spec-final.
 */

export type {
    AgreementDocument,
    AgreementSignature,
    UnsignedAgreementDocument,
} from "./types"

export {
    AGREEMENT_DOMAIN_PREFIX,
    agreementHashHex,
    agreementSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripAgreementSignatures,
} from "./canonical"

export {
    agreementHash,
    buildUnsignedAgreement,
    coSignAgreement,
    signAgreement,
    verifyAgreement,
    verifyAgreementSignatures,
    type AgreementVerificationResult,
} from "./agreement"

export {
    commitRfq,
    type CommitRfqOpts,
    type CommittableOutcome,
    type CommittableRfq,
    type CommittableSession,
} from "./commit"
