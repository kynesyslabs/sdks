/**
 * vLEI verification + DACS-1 attestation.
 *
 * A relying party verifies a KERI/ACDC vLEI chain (`verifyChain`), distils the
 * verdict into a signed, digest-only attestation (`buildAttestation` /
 * `signAttestation`), and anchors it into the subject's DACS-1 bundle as a CCI
 * claim (`anchorAttestation`) that anyone can resolve back (`resolveAttestation`).
 *
 * Built on the SDK's `identity/cci` (primary-claim signing) and
 * `storage/StorageProgram` (SR-2). The verifier reads KERI state through an
 * injected `VleiCredentialSource`, so this module has no KERI-client dependency.
 *
 * NOTE: not re-exported from the package root until public release is approved.
 */
export * from "./types"
export {
    VLEI_SCHEMAS,
    AGENT_AUTHORITY_SCHEMA,
    ALL_SCHEMAS,
    SCHEMA_NAME_BY_SAID,
    CHAIN_RULES,
    type SchemaName,
    type VleiSchemaName,
    type EdgeRule,
    type ChainRule,
} from "./schemas"
export {
    ATTESTATION_DOMAIN_PREFIX,
    attestationSigningBytes,
    attestationCommitment,
    stripAttestationSignature,
    canonicalDigest,
} from "./canonical"
export { verifyChain, txDigest, type VerifyChainOpts } from "./verify"
export {
    buildAttestation,
    signAttestation,
    verifyAttestation,
    vleiClaim,
    keriClaim,
    type BuildAttestationOpts,
} from "./attestation"
export {
    anchorAttestation,
    resolveAttestation,
    attestationProgramName,
    type AnchorAttestationResult,
} from "./anchor"
export {
    VERIFYRESULT_DOMAIN_PREFIX,
    VLEI_RECIPE,
    attestationRefFor,
    toVerifyResult,
    verifyResultSigningBytes,
    signVerifyResult,
    verifyVerifyResultSignature,
    type AttestationRef,
    type VerifyResult,
    type VerifyResultSignature,
    type ToVerifyResultOpts,
} from "./dacs2"
