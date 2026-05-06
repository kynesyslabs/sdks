/**
 * DEM/OS denomination constants.
 *
 * The Demos Network uses two denomination units:
 * - DEM: human-readable, the "display" unit users think in.
 * - OS:  the smallest indivisible unit, used internally and on the wire.
 *
 * Conversion: 1 DEM = 10^9 OS (1 000 000 000 OS).
 *
 * All on-chain math is performed in OS as `bigint` to avoid floating-point
 * precision loss. Wire format is the OS amount serialized as a decimal string.
 */

// REVIEW: P0 foundation — denomination constants exported but not yet used by
// any existing SDK code. Adoption happens in later phases.

/** Number of decimal places between DEM and OS. */
export const OS_DECIMALS = 9

/**
 * Number of OS in 1 DEM, as a `bigint`.
 *
 * @example OS_PER_DEM === 1_000_000_000n
 */
export const OS_PER_DEM = BigInt(10 ** OS_DECIMALS) // 1_000_000_000n

/** Minimum transferable amount: 1 OS. */
export const MIN_AMOUNT_OS = 1n

/** Zero amount constant in OS. */
export const ZERO_OS = 0n
