/**
 * ProofGenerator - Client-side ZK-SNARK proof generation
 *
 * REVIEW: Phase 9 - SDK Integration
 * REVIEW: Phase 10.1 - Production Implementation (Real snarkjs proof generation)
 *
 * Generates Groth16 ZK-SNARK proofs for identity attestations using snarkjs.
 * Circuit artifacts (WASM, proving key, verification key) are the ceremony's
 * final keys, pinned by digest (see ./artifacts).
 */

import { IDENTITY_ARTIFACTS, loadArtifact } from './artifacts'

// REVIEW: Phase 10.1 - Production cryptographic implementation
// snarkjs is loaded lazily (dynamic import inside the proof/verify functions):
// a static import pulls snarkjs → node `fs` into the eager graph, which breaks
// browser bundles that merely touch `encryption`/`websdk`. It's only needed when
// a proof is actually generated/verified.

let singleThreadCurve: Promise<void> | undefined

/**
 * This snarkjs fork starts its workers from blob: URLs, which Node and Bun
 * refuse, so outside a browser every proof and verification would fail.
 * snarkjs reuses the curve cached in `globalThis.curve_bn128`, so a
 * single-threaded curve placed there keeps the work on the calling thread; the
 * identity circuit proves in about half a second without workers. Call after
 * snarkjs is loaded: loading ffjavascript resets the cache.
 */
function useSingleThreadCurveOutsideBrowser(): Promise<void> {
    if (typeof process === 'undefined' || !process.versions?.node) {
        return Promise.resolve()
    }
    singleThreadCurve ??= (async () => {
        const { buildBn128 } = await import('@cryptkeeperzk/ffjavascript')
        const cache = globalThis as { curve_bn128?: unknown }
        cache.curve_bn128 ??= await buildBn128(true)
    })().catch(error => {
        singleThreadCurve = undefined
        throw error
    })
    return singleThreadCurve
}

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

    // Passed as bytes: snarkjs reads a string as a local path outside the browser.
    const [wasm, zkey] = await Promise.all([
        loadArtifact(IDENTITY_ARTIFACTS.wasm),
        loadArtifact(IDENTITY_ARTIFACTS.zkey),
    ])

    // REVIEW: Phase 10.1 - Production-ready proof generation using snarkjs
    let snarkjs: typeof import('@cryptkeeperzk/snarkjs')
    try {
        snarkjs = await import('@cryptkeeperzk/snarkjs')
    } catch (error) {
        throw new Error(
            `ZK proof generation unavailable: could not load snarkjs (zK proofs ` +
                `need a Node/WASM-capable environment). ` +
                `${error instanceof Error ? error.message : String(error)}`,
        )
    }
    await useSingleThreadCurveOutsideBrowser()
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasm,
        zkey,
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
    try {
        const vkey = JSON.parse(new TextDecoder().decode(await loadArtifact(IDENTITY_ARTIFACTS.vkey)))

        // REVIEW: Phase 10.1 - Production-ready verification using snarkjs
        // Convert our ZKProof format to snarkjs format
        const snarkjsProof = {
            pi_a: proof.pi_a,
            pi_b: proof.pi_b,
            pi_c: proof.pi_c,
            protocol: proof.protocol,
        }

        const snarkjs = await import('@cryptkeeperzk/snarkjs')
        await useSingleThreadCurveOutsideBrowser()
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
