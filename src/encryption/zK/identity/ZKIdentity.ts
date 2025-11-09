/**
 * ZKIdentity - User-facing API for ZK identity system
 *
 * REVIEW: Phase 9 - SDK Integration
 *
 * Provides a simple interface for users to:
 * 1. Create identity commitments
 * 2. Generate ZK attestation proofs
 * 3. Interact with node RPC endpoints
 */

import * as CommitmentService from './CommitmentService'
import * as ProofGenerator from './ProofGenerator'

export interface IdentityCommitmentPayload {
    commitment_hash: string
    provider: string
    timestamp: number
}

export interface IdentityAttestationPayload {
    nullifier_hash: string
    merkle_root: string
    proof: ProofGenerator.ZKProof
    public_signals: string[]
    provider: string
}

/**
 * ZKIdentity class for privacy-preserving identity attestations
 *
 * @example
 * ```typescript
 * // Create identity
 * const identity = new ZKIdentity('github:12345')
 *
 * // Get commitment (safe to share publicly)
 * const commitment = identity.getCommitment()
 *
 * // Create commitment transaction
 * const commitmentTx = await identity.createCommitmentTransaction('http://localhost:3000')
 *
 * // Later: Create anonymous attestation
 * const attestationTx = await identity.createAttestationTransaction(
 *     'http://localhost:3000',
 *     'dao_vote_123'
 * )
 * ```
 */
export class ZKIdentity {
    private providerId: string
    private secret: string

    /**
     * Create a new ZK identity
     *
     * @param providerId - Provider identifier (e.g., "github:12345", "discord:67890")
     * @param secret - Optional secret (will be generated if not provided)
     *
     * WARNING: Keep the secret secure! Store it encrypted in local storage.
     * If lost, you cannot create attestations for this commitment.
     */
    constructor(providerId: string, secret?: string) {
        this.providerId = providerId
        this.secret = secret || CommitmentService.generateSecret()
    }

    /**
     * Get the identity commitment hash
     *
     * This is safe to share publicly and will be stored in the Merkle tree.
     *
     * @returns Commitment hash as string
     */
    getCommitment(): string {
        return CommitmentService.generateCommitment(this.providerId, this.secret)
    }

    /**
     * Get the provider name from provider ID
     *
     * @returns Provider name (e.g., "github", "discord")
     */
    getProvider(): string {
        return this.providerId.split(':')[0]
    }

    /**
     * Get the secret (use with caution!)
     *
     * @returns The secret value
     *
     * WARNING: Never transmit this over the network!
     */
    getSecret(): string {
        return this.secret
    }

    /**
     * Create a commitment transaction to submit to the node
     *
     * This adds your commitment to the global Merkle tree.
     * You must submit this transaction before you can create attestations.
     *
     * @param rpcUrl - Node RPC URL
     * @returns Commitment transaction payload
     */
    async createCommitmentTransaction(
        rpcUrl: string,
    ): Promise<IdentityCommitmentPayload> {
        const commitment = this.getCommitment()

        const payload: IdentityCommitmentPayload = {
            commitment_hash: commitment,
            provider: this.getProvider(),
            timestamp: Date.now(),
        }

        return payload
    }

    /**
     * Create an anonymous attestation transaction
     *
     * This proves you have a valid identity commitment in the Merkle tree
     * without revealing which one. Uses ZK-SNARKs for privacy.
     *
     * @param rpcUrl - Node RPC URL
     * @param context - Context string for this attestation (e.g., "dao_vote_123")
     * @returns Attestation transaction payload
     *
     * NOTE: Each context can only be used once per identity (nullifier prevents reuse)
     */
    async createAttestationTransaction(
        rpcUrl: string,
        context: string,
    ): Promise<IdentityAttestationPayload> {
        // 1. Check if commitment exists in Merkle tree
        const commitment = this.getCommitment()

        // 2. Fetch Merkle proof for our commitment
        const proofResponse = await fetch(`${rpcUrl}/zk/merkle/proof/${commitment}`)

        if (!proofResponse.ok) {
            const error = await proofResponse.json()
            throw new Error(
                `Failed to get Merkle proof: ${error.error || 'Unknown error'}`,
            )
        }

        const proofData = await proofResponse.json()
        const merkleProof: ProofGenerator.MerkleProof = {
            siblings: proofData.proof.siblings,
            pathIndices: proofData.proof.pathIndices,
            root: proofData.proof.root,
            leaf: proofData.proof.leaf || commitment,
        }

        // 3. Fetch current Merkle root
        const rootResponse = await fetch(`${rpcUrl}/zk/merkle-root`)

        if (!rootResponse.ok) {
            throw new Error('Failed to get Merkle root')
        }

        const rootData = await rootResponse.json()
        const merkleRoot = rootData.rootHash

        // 4. Check if nullifier has been used for this context
        const nullifier = CommitmentService.generateNullifier(
            this.providerId,
            context,
        )
        const nullifierResponse = await fetch(`${rpcUrl}/zk/nullifier/${nullifier}`)

        if (nullifierResponse.ok) {
            const nullifierData = await nullifierResponse.json()
            if (nullifierData.used) {
                throw new Error(
                    `Nullifier already used for context "${context}". Each identity can only attest once per context.`,
                )
            }
        }

        // 5. Generate ZK proof
        const { proof, publicSignals } =
            await ProofGenerator.generateIdentityProof(
                this.providerId,
                this.secret,
                context,
                merkleProof,
                merkleRoot,
            )

        // 6. Create attestation payload
        const payload: IdentityAttestationPayload = {
            nullifier_hash: publicSignals[0],
            merkle_root: publicSignals[1],
            proof,
            public_signals: publicSignals,
            provider: this.getProvider(),
        }

        return payload
    }

    /**
     * Verify an attestation locally (optional - for testing)
     *
     * @param attestation - Attestation payload to verify
     * @returns True if valid
     *
     * NOTE: Node will verify proofs server-side, this is mainly for debugging
     */
    static async verifyAttestation(
        attestation: IdentityAttestationPayload,
    ): Promise<boolean> {
        return await ProofGenerator.verifyProof(
            attestation.proof,
            attestation.public_signals,
        )
    }

    /**
     * Export identity for backup
     *
     * @returns Object containing provider ID and secret
     *
     * WARNING: Store this securely! Anyone with this data can create
     * attestations as you.
     */
    export(): { providerId: string; secret: string } {
        return {
            providerId: this.providerId,
            secret: this.secret,
        }
    }

    /**
     * Import identity from backup
     *
     * @param data - Exported identity data
     * @returns New ZKIdentity instance
     */
    static import(data: { providerId: string; secret: string }): ZKIdentity {
        return new ZKIdentity(data.providerId, data.secret)
    }

    /**
     * Generate a fresh identity with random secret
     *
     * @param providerId - Provider identifier
     * @returns New ZKIdentity instance
     */
    static generate(providerId: string): ZKIdentity {
        return new ZKIdentity(providerId)
    }
}
