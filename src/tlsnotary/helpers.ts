/**
 * TLSNotary Helper Functions
 *
 * Standalone utility functions for TLSNotary operations.
 */

import { OS_PER_DEM } from "../denomination"

/**
 * Calculate the storage fee for a TLSNotary proof.
 *
 * Fee structure:
 * - 1 DEM base fee
 * - 1 DEM per KB of proof data
 *
 * P4: returns `bigint` in OS (the SDK's internal canonical representation)
 * instead of `number` in DEM. This is a breaking change vs v2.x — callers
 * must pass the result through `denomination.osToDem()` before display.
 *
 * @param proofSizeKB - Size of proof in kilobytes (non-negative integer).
 * @returns Total fee as a `bigint` in OS.
 *
 * @example
 * ```typescript
 * import { calculateStorageFee } from '@kynesyslabs/demosdk/tlsnotary';
 * import { denomination } from '@kynesyslabs/demosdk';
 *
 * const proofSize = Math.ceil(proof.length / 1024);
 * const feeOs = calculateStorageFee(proofSize);
 * const feeDem = denomination.osToDem(feeOs); // e.g. "6.0" for 5KB
 * ```
 */
export function calculateStorageFee(proofSizeKB: number): bigint {
    if (!Number.isFinite(proofSizeKB) || proofSizeKB < 0) {
        throw new Error(
            `[tlsnotary.calculateStorageFee] proofSizeKB must be a non-negative finite number, got ${proofSizeKB}`,
        )
    }
    const sizeChunks = BigInt(Math.ceil(proofSizeKB))
    // 1 DEM base + 1 DEM per KB, expressed in OS (`OS_PER_DEM` per DEM).
    return OS_PER_DEM + sizeChunks * OS_PER_DEM
}

/**
 * Size in bytes of the presentation a proof carries: the decoded `data` of a
 * presentation JSON, the form nodes measure against `maxPresentationBytes`.
 * Anything else is measured as its UTF-8 bytes.
 */
export function presentationByteLength(proof: string): number {
    try {
        const parsed = JSON.parse(proof)
        const data = parsed?.data
        if (typeof data === "string") {
            const hex = data.replace(/^0x/i, "")
            if (/^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 === 0) {
                return hex.length / 2
            }
        }
    } catch {
        // not JSON: measured as raw text below
    }
    return new TextEncoder().encode(proof).length
}
