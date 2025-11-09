/**
 * ZK Identity Module
 *
 * REVIEW: Phase 9 - SDK Integration
 *
 * Provides privacy-preserving identity attestations using ZK-SNARKs.
 */

export * as CommitmentService from './CommitmentService'
export * as ProofGenerator from './ProofGenerator'
export { ZKIdentity } from './ZKIdentity'

// Re-export types for convenience
export type {
    ZKProof,
    ProofGenerationResult,
    MerkleProof,
} from './ProofGenerator'

export type {
    IdentityCommitmentPayload,
    IdentityAttestationPayload,
} from './ZKIdentity'
