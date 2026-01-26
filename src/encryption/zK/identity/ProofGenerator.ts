/**
 * ProofGenerator - Client-side ZK-SNARK proof generation
 *
 * REVIEW: Phase 9 - SDK Integration
 * REVIEW: Phase 10.1 - Production Implementation (Real snarkjs proof generation)
 * REVIEW: Phase 10.4 - CDN Integration (Production-ready with CDN URLs)
 * REVIEW: Phase 10.5 - Hybrid Environment Detection (Auto-detect service worker context)
 *
 * Generates Groth16 ZK-SNARK proofs for identity attestations using snarkjs.
 * Circuit artifacts (WASM, proving key, verification key) are loaded from CDN.
 *
 * Environment Compatibility:
 * - Automatically detects Chrome MV3 service workers and uses single-threaded mode
 * - Uses parallel Web Workers in standard browser/Node.js contexts for better performance
 * - Can be manually overridden via ProofGeneratorConfig
 */

// REVIEW: Phase 10.1 - Production cryptographic implementation
import * as snarkjs from 'snarkjs'

/**
 * Detect if running in a restricted environment that doesn't support Web Workers
 *
 * Restricted environments include:
 * - Chrome MV3 Service Workers (cannot spawn nested Web Workers)
 * - Cloudflare Workers
 * - Bun runtime (limited Worker support)
 * - SES (Secure EcmaScript) sandboxes
 *
 * @returns true if Web Workers are not available or unreliable
 */
function isRestrictedWorkerEnvironment(): boolean {
    // Check for Service Worker context (Chrome MV3 extensions)
    // Use string-based check to avoid TypeScript errors in non-browser environments
    const g = globalThis as any
    if (typeof g.ServiceWorkerGlobalScope !== 'undefined' &&
        typeof self !== 'undefined' &&
        self instanceof g.ServiceWorkerGlobalScope) {
        return true
    }

    // Check for Cloudflare Workers (no window, has caches API)
    if (typeof globalThis !== 'undefined' &&
        typeof (globalThis as any).caches !== 'undefined' &&
        typeof (globalThis as any).window === 'undefined' &&
        typeof (globalThis as any).document === 'undefined') {
        // Could be Cloudflare Worker or Service Worker - check for CF-specific globals
        if (typeof (globalThis as any).HTMLRewriter !== 'undefined') {
            return true
        }
    }

    // Check if Worker constructor exists but is a stub/polyfill
    if (typeof Worker !== 'undefined') {
        try {
            // Some polyfills define Worker but it doesn't work properly
            // Check for common stub patterns (e.g., _listeners property)
            const workerProto = Worker.prototype
            if (workerProto && typeof (workerProto as any)._listeners !== 'undefined') {
                return true // It's our stub Worker
            }
        } catch {
            // If checking fails, assume restricted
            return true
        }
    }

    // Check for Bun runtime
    if (typeof (globalThis as any).Bun !== 'undefined') {
        return true
    }

    // Default: assume Workers are available
    return false
}

/**
 * Configuration options for proof generation
 */
export interface ProofGeneratorConfig {
    /**
     * Force single-threaded mode regardless of environment detection.
     * Useful for debugging or when you know Workers won't work.
     * @default undefined (auto-detect)
     */
    forceSingleThread?: boolean

    /**
     * Custom logger for proof generation progress
     * @default undefined (no logging)
     */
    logger?: {
        debug?: (msg: string) => void
        info?: (msg: string) => void
        warn?: (msg: string) => void
        error?: (msg: string) => void
    }
}

// Global configuration (can be set once for all proof operations)
let globalConfig: ProofGeneratorConfig = {}

/**
 * Configure the ProofGenerator globally
 *
 * @param config - Configuration options
 *
 * @example
 * ```typescript
 * // Force single-threaded mode globally
 * ProofGenerator.configure({ forceSingleThread: true })
 *
 * // Add logging
 * ProofGenerator.configure({
 *     logger: { info: console.log, error: console.error }
 * })
 * ```
 */
export function configure(config: ProofGeneratorConfig): void {
    globalConfig = { ...globalConfig, ...config }
}

/**
 * Get current configuration
 */
export function getConfig(): ProofGeneratorConfig {
    return { ...globalConfig }
}

/**
 * Check if proof generation will use single-threaded mode
 *
 * @returns true if single-threaded mode will be used
 */
export function willUseSingleThread(): boolean {
    if (globalConfig.forceSingleThread !== undefined) {
        return globalConfig.forceSingleThread
    }

    return isRestrictedWorkerEnvironment()
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

    // REVIEW: Phase 10.4 - Production CDN URLs for circuit artifacts
    const wasmPath = 'https://files.demos.sh/zk-circuits/v1/identity_with_merkle.wasm'
    const zkeyPath = 'https://files.demos.sh/zk-circuits/v1/identity_with_merkle_final.zkey'

    // REVIEW: Phase 10.5 - Hybrid environment detection
    // Automatically use singleThread in restricted environments (service workers, etc.)
    // Use parallel workers in standard browser/Node.js for better performance
    const useSingleThread = willUseSingleThread()

    if (globalConfig.logger?.info) {
        globalConfig.logger.info(
            `[ProofGenerator] Using ${useSingleThread ? 'single-threaded' : 'parallel'} mode`
        )
    }

    // REVIEW: Phase 10.1 - Production-ready proof generation using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath,
        undefined, // logger
        undefined, // wtnsCalcOptions
        useSingleThread ? { singleThread: true } : undefined, // proverOptions - auto-detect environment
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
            curve: 'bn128', // Standard curve for Groth16 proofs
        }

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
