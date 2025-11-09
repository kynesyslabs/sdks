/**
 * ProofGenerator - Client-side ZK-SNARK proof generation
 *
 * REVIEW: Phase 9 - SDK Integration
 * REVIEW: Phase 10.1 - Production Implementation (Real snarkjs proof generation)
 *
 * Generates Groth16 ZK-SNARK proofs for identity attestations using snarkjs.
 * Requires the circuit's proving key (WASM) and witness calculator.
 */

// REVIEW: Phase 10.1 - Production cryptographic implementation
import * as snarkjs from 'snarkjs'

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

    // REVIEW: Phase 10.1 - Real snarkjs proof generation
    // TODO (Phase 10.4): Load WASM and proving key from CDN URLs provided by user
    // Once CDN is ready, these paths will be configured
    const wasmPath = undefined // Will be set to CDN URL in Phase 10.4
    const zkeyPath = undefined // Will be set to CDN URL in Phase 10.4

    if (!wasmPath || !zkeyPath) {
        throw new Error(
            'ZK proof generation not yet configured. WASM and proving key URLs need to be set. ' +
                'This will be completed in Phase 10.4 once CDN is ready.',
        )
    }

    // REVIEW: Phase 10.1 - Production-ready proof generation using snarkjs
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
 * REVIEW: Phase 10.1 - Production verification implementation
 */
export async function verifyProof(
    proof: ZKProof,
    publicSignals: string[],
): Promise<boolean> {
    // TODO (Phase 10.4): Load verification key from CDN or node
    // Verification key is public and can be loaded from node RPC or CDN
    const vkey = undefined // Will be set to CDN URL or loaded from node in Phase 10.4

    if (!vkey) {
        throw new Error(
            'ZK proof verification not yet configured. Verification key URL needs to be set. ' +
                'This will be completed in Phase 10.4 once CDN is ready.',
        )
    }

    // REVIEW: Phase 10.1 - Production-ready verification using snarkjs
    // Convert our ZKProof format to snarkjs format
    const snarkjsProof = {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: proof.protocol,
    }

    return await snarkjs.groth16.verify(vkey, publicSignals, snarkjsProof)
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
