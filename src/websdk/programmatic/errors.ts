import { osToDem } from "@/denomination"
import type { TxConfirmInfo } from "./types"

/**
 * Thrown by the programmatic-tx runner when a transaction's confirmed fee
 * exceeds the configured ceiling (`maxFee`, default 5 DEM) and the caller
 * did not supply a confirmation callback to override the decision.
 *
 * The transaction has been *built, signed and confirmed* by the time this
 * throws — it simply was NOT broadcast. Callers can catch this, inspect
 * `info.validityData`, and either raise `maxFee` or re-run with an explicit
 * `confirm` callback.
 */
export class FeeCapExceededError extends Error {
    /** Total confirmed fee, in OS (smallest unit). */
    readonly feeOs: bigint
    /** Configured ceiling, in OS. */
    readonly capOs: bigint
    /** The confirmation context (transaction, validityData, fee breakdown). */
    readonly info: TxConfirmInfo

    constructor(feeOs: bigint, capOs: bigint, info: TxConfirmInfo) {
        super(
            `[programmatic-tx] fee ${osToDem(feeOs)} DEM exceeds the ` +
                `maxFee ceiling of ${osToDem(capOs)} DEM; transaction was ` +
                `signed and confirmed but NOT broadcast. Raise 'maxFee' or ` +
                `pass a 'confirm' callback to override.`,
        )
        this.name = "FeeCapExceededError"
        this.feeOs = feeOs
        this.capOs = capOs
        this.info = info
    }
}
