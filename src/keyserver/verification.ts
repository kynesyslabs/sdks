/**
 * DAHR Attestation Verification Utilities
 *
 * Provides cryptographic verification of Key Server attestations.
 * Allows consuming apps to independently verify that the Key Server
 * actually performed the OAuth verification.
 */

import { Cryptography } from "@/encryption";
import type { DAHRAttestation, OAuthVerificationResult } from "./types";

/**
 * Options for attestation verification
 */
export interface VerifyAttestationOptions {
    /**
     * Maximum age of attestation in milliseconds (default: 1 hour)
     * Set to 0 to disable timestamp validation
     */
    maxAge?: number;

    /**
     * Expected node public key (optional additional validation)
     */
    expectedNodePubKey?: string;
}

/**
 * Result of attestation verification
 */
export interface AttestationVerificationResult {
    /** Whether the attestation is valid */
    valid: boolean;

    /** Reason for failure (if invalid) */
    reason?: string;

    /** Attestation metadata for logging/auditing */
    metadata?: {
        sessionId: string;
        timestamp: number;
        keyServerPubKey: string;
        nodePubKey: string;
        version: string;
    };
}

/**
 * Verify a DAHR attestation from Key Server
 *
 * This function verifies:
 * 1. The Ed25519 signature is valid for the responseHash
 * 2. The signature was made by the expected Key Server public key
 * 3. The attestation is not expired (optional)
 * 4. The node public key matches expected (optional)
 *
 * @param attestation - The DAHR attestation to verify
 * @param keyServerPubKey - Expected Key Server public key (hex-encoded)
 * @param options - Additional verification options
 * @returns Verification result with validity and reason
 *
 * @example
 * ```typescript
 * const result = await client.verifyOAuth("github", { ... });
 *
 * const verification = verifyAttestation(
 *     result.attestation,
 *     KNOWN_KEY_SERVER_PUBKEY,
 * );
 *
 * if (!verification.valid) {
 *     console.error("Attestation invalid:", verification.reason);
 * }
 * ```
 */
export function verifyAttestation(
    attestation: DAHRAttestation,
    keyServerPubKey: string,
    options?: VerifyAttestationOptions,
): AttestationVerificationResult {
    const maxAge = options?.maxAge ?? 3600000; // 1 hour default

    // Validate attestation structure
    if (!attestation || !attestation.signature || !attestation.metadata) {
        return {
            valid: false,
            reason: "Invalid attestation structure",
        };
    }

    // Check signature type
    if (attestation.signature.type !== "Ed25519") {
        return {
            valid: false,
            reason: `Unsupported signature type: ${attestation.signature.type}`,
        };
    }

    // Check Key Server public key matches
    if (attestation.metadata.keyServerPubKey !== keyServerPubKey) {
        return {
            valid: false,
            reason: "Key Server public key mismatch",
            metadata: attestation.metadata,
        };
    }

    // Check node public key if expected
    if (
        options?.expectedNodePubKey &&
        attestation.metadata.nodePubKey !== options.expectedNodePubKey
    ) {
        return {
            valid: false,
            reason: "Node public key mismatch",
            metadata: attestation.metadata,
        };
    }

    // Check timestamp if maxAge is set
    if (maxAge > 0) {
        const age = Date.now() - attestation.metadata.timestamp;
        if (age > maxAge) {
            return {
                valid: false,
                reason: `Attestation expired (age: ${Math.round(age / 1000)}s, max: ${Math.round(maxAge / 1000)}s)`,
                metadata: attestation.metadata,
            };
        }
    }

    // Verify Ed25519 signature over responseHash
    try {
        const isValid = Cryptography.ed25519.verify(
            attestation.responseHash,
            hexToBuffer(attestation.signature.data),
            hexToBuffer(keyServerPubKey),
        );

        if (!isValid) {
            return {
                valid: false,
                reason: "Signature verification failed",
                metadata: attestation.metadata,
            };
        }

        return {
            valid: true,
            metadata: attestation.metadata,
        };
    } catch (error) {
        return {
            valid: false,
            reason: `Signature verification error: ${(error as Error).message}`,
            metadata: attestation.metadata,
        };
    }
}

/**
 * Verify attestation from a full OAuth verification result
 *
 * Convenience wrapper that extracts the attestation from the result.
 *
 * @param result - The OAuth verification result
 * @param keyServerPubKey - Expected Key Server public key (hex-encoded)
 * @param options - Additional verification options
 * @returns Verification result
 */
export function verifyOAuthAttestation(
    result: OAuthVerificationResult,
    keyServerPubKey: string,
    options?: VerifyAttestationOptions,
): AttestationVerificationResult {
    if (!result.attestation) {
        return {
            valid: false,
            reason: "No attestation in result",
        };
    }

    return verifyAttestation(result.attestation, keyServerPubKey, options);
}

/**
 * Convert hex string to Buffer for cryptographic operations
 */
function hexToBuffer(hex: string): Buffer {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    return Buffer.from(cleanHex, "hex");
}
