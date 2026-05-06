/**
 * DEM/OS denomination utilities.
 *
 * Public surface for converting between human-readable DEM amounts and
 * the internal/wire OS unit. See `./constants` and `./conversion` for details.
 *
 * 1 DEM = 10^9 OS.
 */

// REVIEW: P0 foundation — barrel export for the new denomination module.

export {
    OS_DECIMALS,
    OS_PER_DEM,
    MIN_AMOUNT_OS,
    ZERO_OS,
} from "./constants"

export {
    demToOs,
    osToDem,
    parseOsString,
    toOsString,
    formatDem,
} from "./conversion"
