/**
 * TLSNotary Helper Functions
 *
 * Standalone utility functions for TLSNotary operations.
 */

/**
 * Calculate the storage fee for a TLSNotary proof
 *
 * Fee structure:
 * - 1 DEM base fee
 * - 1 DEM per KB of proof data
 *
 * @param proofSizeKB - Size of proof in kilobytes
 * @returns Total fee in DEM
 *
 * @example
 * ```typescript
 * import { calculateStorageFee } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * const proofSize = Math.ceil(proof.length / 1024);
 * const fee = calculateStorageFee(proofSize); // e.g., 6 DEM for 5KB
 * ```
 */
export function calculateStorageFee(proofSizeKB: number): number {
    return 1 + proofSizeKB // 1 DEM base + 1 DEM per KB
}
