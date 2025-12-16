/**
 * ProofGenerator - Client-side ZK-SNARK proof generation
 *
 * REVIEW: Phase 9 - SDK Integration
 * REVIEW: Phase 10.1 - Production Implementation (Real snarkjs proof generation)
 * REVIEW: Phase 10.4 - CDN Integration (Production-ready with CDN URLs)
 *
 * Generates Groth16 ZK-SNARK proofs for identity attestations using snarkjs.
 * Circuit artifacts (WASM, proving key, verification key) are loaded from CDN.
 */

// REVIEW: Phase 10.1 - Production cryptographic implementation
// import * as snarkjs from 'snarkjs'

export interface ZKProof {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
}

export interface ProofGenerationResult {
    proof: ZKProof
    publicSignals: string[]
}

export interface MerkleProof {
    siblings: string[][]
    pathIndices: number[]
    root: string
    leaf: string
}

/**
 * Generate a ZK-SNARK proof for identity attestation
 *
 * @param providerId - Provider identifier (e.g., "github:12345")
 * @param secret - User's secret value
 * @param context - Context string for this attestation
 * @param merkleProof - Merkle proof from node RPC
 * @param merkleRoot - Current Merkle root from node RPC
 * @returns Proof and public signals
 *
 * @example
 * ```typescript
 * const result = await ProofGenerator.generateIdentityProof(
 *     "github:12345",
 *     "secret123",
 *     "dao_vote_123",
 *     merkleProof,
 *     merkleRoot
 * )
 * // result: { proof: {...}, publicSignals: [nullifier, merkleRoot, context] }
 * ```
 */
export async function generateIdentityProof(
    providerId: string,
    secret: string,
    context: string,
    merkleProof: MerkleProof,
    merkleRoot: string,
): Promise<ProofGenerationResult> {
    // Convert inputs to BigInt/field elements
    const providerIdBigInt = stringToBigInt(providerId)
    const secretBigInt = stringToBigInt(secret)
    const contextBigInt = stringToBigInt(context)

    // Prepare circuit inputs
    const circuitInputs = {
        // Private inputs
        provider_id: providerIdBigInt.toString(),
        secret: secretBigInt.toString(),
        pathElements: merkleProof.siblings.map(s => s.map(v => v.toString())),
        pathIndices: merkleProof.pathIndices,

        // Public inputs
        context: contextBigInt.toString(),
        merkle_root: merkleRoot,
    }

    // REVIEW: Phase 10.4 - Production CDN URLs for circuit artifacts
    const wasmPath = 'https://files.demos.sh/zk-circuits/v1/identity_with_merkle.wasm'
    const zkeyPath = 'https://files.demos.sh/zk-circuits/v1/identity_with_merkle_final.zkey'

    // REVIEW: Phase 10.1 - Production-ready proof generation using snarkjs
    // import snarkjs lazily here
    const snarkjs = await import('snarkjs')
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath,
    )

    // Convert proof to our ZKProof format
    const zkProof: ZKProof = {
        pi_a: [
            proof.pi_a[0].toString(),
            proof.pi_a[1].toString(),
            proof.pi_a[2].toString(),
        ],
        pi_b: [
            [proof.pi_b[0][0].toString(), proof.pi_b[0][1].toString()],
            [proof.pi_b[1][0].toString(), proof.pi_b[1][1].toString()],
            [proof.pi_b[2][0].toString(), proof.pi_b[2][1].toString()],
        ],
        pi_c: [
            proof.pi_c[0].toString(),
            proof.pi_c[1].toString(),
            proof.pi_c[2].toString(),
        ],
        protocol: 'groth16',
    }

    return {
        proof: zkProof,
        publicSignals: publicSignals.map((s: any) => s.toString()),
    }
}

/**
 * Verify a proof locally (optional - mainly for testing)
 *
 * @param proof - The proof to verify
 * @param publicSignals - Public signals for the proof
 * @returns True if proof is valid
 *
 * NOTE: Node RPC will do the actual verification, this is mainly for debugging
 * REVIEW: Phase 10.4 - Production verification implementation with CDN
 */
export async function verifyProof(
    proof: ZKProof,
    publicSignals: string[],
): Promise<boolean> {
    // REVIEW: Phase 10.4 - Load verification key from CDN
    const vkeyUrl = 'https://files.demos.sh/zk-circuits/v1/verification_key_merkle.json'

    try {
        const response = await fetch(vkeyUrl)
        if (!response.ok) {
            throw new Error(`Failed to load verification key: ${response.status} ${response.statusText}`)
        }
        const vkey = await response.json()

        // REVIEW: Phase 10.1 - Production-ready verification using snarkjs
        // Convert our ZKProof format to snarkjs format
        const snarkjsProof = {
            pi_a: proof.pi_a,
            pi_b: proof.pi_b,
            pi_c: proof.pi_c,
            protocol: proof.protocol,
            curve: 'bn128',
        }

        // import snarkjs lazily here
        const snarkjs = await import('snarkjs')
        return await snarkjs.groth16.verify(vkey, publicSignals, snarkjsProof)
    } catch (error) {
        throw new Error(
            `ZK proof verification failed: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert string to BigInt using simple hashing
 *
 * @param str - Input string to convert
 * @returns BigInt representation of the string
 */
function stringToBigInt(str: string): bigint {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    return BigInt('0x' + hex)
}
