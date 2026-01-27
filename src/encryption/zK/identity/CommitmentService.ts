/**
 * CommitmentService - Generate identity commitments and nullifiers
 *
 * REVIEW: Phase 9 - SDK Integration
 * REVIEW: Phase 10.1 - Production Implementation (Real Poseidon hash)
 *
 * Provides methods for generating cryptographic commitments and nullifiers
 * for the ZK identity system using Poseidon hash.
 */

// REVIEW: Phase 10.1 - Production cryptographic implementation
import { poseidon2 } from 'poseidon-lite'

/**
 * Generate a Poseidon hash commitment from provider ID and secret
 *
 * @param providerId - Provider identifier (e.g., "github:12345")
 * @param secret - User's secret value (generated client-side)
 * @returns Commitment hash as string
 *
 * @example
 * ```typescript
 * const commitment = CommitmentService.generateCommitment("github:12345", "secret123")
 * // commitment: "1234567890..."
 * ```
 */
export function generateCommitment(providerId: string, secret: string): string {
    // Convert strings to BigInt for Poseidon hashing
    const providerHash = stringToBigInt(providerId)
    const secretHash = stringToBigInt(secret)

    // Use Poseidon hash (ZK-friendly)
    // NOTE: This will be implemented using poseidon-lite or browser-compatible alternative
    // For now, using a placeholder that will be replaced with actual Poseidon implementation
    const commitment = poseidonHash([providerHash, secretHash])

    return commitment.toString()
}

/**
 * Generate a nullifier from provider ID and context
 *
 * @param providerId - Provider identifier (e.g., "github:12345")
 * @param context - Context string (e.g., "dao_vote_123")
 * @returns Nullifier hash as string
 *
 * @example
 * ```typescript
 * const nullifier = CommitmentService.generateNullifier("github:12345", "dao_vote_123")
 * // nullifier: "9876543210..."
 * ```
 */
export function generateNullifier(providerId: string, context: string): string {
    const providerHash = stringToBigInt(providerId)
    const contextHash = stringToBigInt(context)

    const nullifier = poseidonHash([providerHash, contextHash])

    return nullifier.toString()
}

/**
 * Generate a cryptographically secure random secret
 *
 * @returns Random secret as hex string
 *
 * @example
 * ```typescript
 * const secret = CommitmentService.generateSecret()
 * // secret: "a1b2c3d4e5f6..."
 * ```
 */
export function generateSecret(): string {
    // Use Web Crypto API for secure random generation
    if (typeof window !== 'undefined' && window.crypto) {
        const array = new Uint8Array(32)
        window.crypto.getRandomValues(array)
        return uint8ArrayToHex(array)
    }

    // Node.js environment
    if (typeof require !== 'undefined') {
        const crypto = require('crypto')
        return crypto.randomBytes(32).toString('hex')
    }

    throw new Error('No secure random number generator available')
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert string to BigInt using simple hashing
 * NOTE: For production, should use more robust hashing
 */
function stringToBigInt(str: string): bigint {
    // Simple conversion: encode to UTF-8 bytes then to hex
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    const hex = uint8ArrayToHex(bytes)
    return BigInt('0x' + hex)
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(array: Uint8Array): string {
    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Poseidon hash implementation using poseidon-lite
 *
 * Poseidon is a ZK-friendly hash function optimized for use in
 * zero-knowledge proof circuits. We use poseidon2 for hashing 2 inputs.
 *
 * @param inputs - Array of exactly 2 BigInt values to hash
 * @returns Poseidon hash output as BigInt
 */
function poseidonHash(inputs: bigint[]): bigint {
    if (inputs.length !== 2) {
        throw new Error('poseidonHash expects exactly 2 inputs')
    }
    return poseidon2(inputs)
}
