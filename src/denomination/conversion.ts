/**
 * DEM <-> OS conversion utilities.
 *
 * Internal representation: `bigint` (OS, smallest unit).
 * Wire representation:     decimal `string` (OS).
 * Display representation:  decimal `string` (DEM, human-readable).
 *
 * 1 DEM = 10^9 OS.
 */

import { OS_DECIMALS, ZERO_OS } from "./constants"

// REVIEW: P0 foundation — conversion utilities exported but not yet wired into
// any existing SDK code path. They are dormant until later migration phases.

/**
 * Convert a DEM amount (human-readable) to an OS amount (smallest unit).
 *
 * Accepts `number` or `string` for ergonomics. The result is always a `bigint`.
 * Strings are preferred for high-precision input because JavaScript `number`
 * cannot represent every 9-decimal value exactly.
 *
 * Throws if:
 * - The input has more than {@link OS_DECIMALS} fractional digits.
 * - The resulting amount is negative.
 *
 * @example demToOs(1)            // => 1_000_000_000n
 * @example demToOs("0.5")        // => 500_000_000n
 * @example demToOs(100)          // => 100_000_000_000n
 * @example demToOs("1.123456789")// => 1_123_456_789n
 *
 * @param dem - DEM amount as `number` or decimal `string`.
 * @returns OS amount as `bigint`.
 */
export function demToOs(dem: number | string): bigint {
    const str = typeof dem === "number" ? dem.toString() : dem

    // Split on decimal point. Missing fractional part defaults to "".
    const [whole, frac = ""] = str.split(".")

    if (frac.length > OS_DECIMALS) {
        throw new Error(
            `DEM amount "${str}" exceeds maximum ${OS_DECIMALS} decimal places`,
        )
    }

    // Pad fractional part to exactly OS_DECIMALS digits, then concatenate.
    const paddedFrac = frac.padEnd(OS_DECIMALS, "0")
    const combined = `${whole}${paddedFrac}`

    const result = BigInt(combined)
    if (result < ZERO_OS) {
        throw new Error(`Negative amounts not allowed: ${str}`)
    }
    return result
}

/**
 * Convert an OS amount (smallest unit) to a DEM string (human-readable).
 *
 * Always returns a `string` to preserve precision. The result has exactly one
 * decimal point, with trailing fractional zeros trimmed (but at least one
 * fractional digit retained).
 *
 * Negative inputs are supported and produce a leading `-`.
 *
 * @example osToDem(1_000_000_000n) // => "1.0"
 * @example osToDem(500_000_000n)   // => "0.5"
 * @example osToDem(1n)             // => "0.000000001"
 * @example osToDem(0n)             // => "0.0"
 *
 * @param os - OS amount as `bigint`.
 * @returns DEM amount as decimal `string`.
 */
export function osToDem(os: bigint): string {
    const isNegative = os < ZERO_OS
    const abs = isNegative ? -os : os

    // Pad so we always have at least OS_DECIMALS+1 digits, ensuring the
    // whole-number slice is non-empty for sub-1-DEM values.
    const str = abs.toString().padStart(OS_DECIMALS + 1, "0")

    const whole = str.slice(0, str.length - OS_DECIMALS)
    const frac = str.slice(str.length - OS_DECIMALS)

    // Trim trailing zeros from fractional part, but keep at least one digit.
    const trimmedFrac = frac.replace(/0+$/, "") || "0"

    return `${isNegative ? "-" : ""}${whole}.${trimmedFrac}`
}

/**
 * Parse a wire-format OS string into a `bigint`.
 *
 * The wire format is always the OS amount as a base-10 integer string.
 *
 * @example parseOsString("1000000000") // => 1_000_000_000n
 *
 * @param osString - OS amount as a decimal integer string.
 * @returns OS amount as `bigint`.
 */
export function parseOsString(osString: string): bigint {
    return BigInt(osString)
}

/**
 * Serialize a `bigint` OS amount to its wire-format string.
 *
 * @example toOsString(1_000_000_000n) // => "1000000000"
 *
 * @param os - OS amount as `bigint`.
 * @returns OS amount as a decimal integer string.
 */
export function toOsString(os: bigint): string {
    return os.toString()
}

/**
 * Format an OS amount as a human-readable DEM string with a unit suffix.
 *
 * Useful for log lines, error messages, and UI display.
 *
 * @example formatDem(1_000_000_000n) // => "1.0 DEM"
 *
 * @param os - OS amount as `bigint`.
 * @returns Human-readable DEM string with " DEM" suffix.
 */
export function formatDem(os: bigint): string {
    return `${osToDem(os)} DEM`
}
