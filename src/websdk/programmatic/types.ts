import type { Transaction } from "@/types"
import type {
    RPCResponse,
    RPCResponseWithValidityData,
} from "@/types/communication/rpc"

/**
 * Default fee ceiling, in DEM, applied by the programmatic-tx runner when
 * `maxFee` is not specified. If a confirmed transaction's total fee exceeds
 * this and no `confirm` callback is provided, the runner throws
 * {@link FeeCapExceededError} instead of broadcasting.
 */
export const DEFAULT_MAX_FEE_DEM = 5

/**
 * Anything the runner can turn into a confirmed transaction:
 *  - a `Transaction` (signed or unsigned — unsigned is signed first),
 *  - an already-confirmed `RPCResponseWithValidityData` (e.g. the value the
 *    `Identities.*` builders return), or
 *  - a thunk producing either of the above.
 */
export type TxSource =
    | Transaction
    | RPCResponseWithValidityData
    | (() => Promise<Transaction | RPCResponseWithValidityData>)

/**
 * Snapshot handed to a {@link ConfirmHook} (and carried on
 * {@link FeeCapExceededError}) after `confirm` but before `broadcast`.
 */
export interface TxConfirmInfo {
    /** The signed, confirmed transaction. */
    transaction: Transaction
    /** Raw validity data from the node (gas operation, reference block, …). */
    validityData: RPCResponseWithValidityData
    /** Total fee for this transaction, in OS (smallest unit). */
    feeOs: bigint
    /** Total fee for this transaction, human-readable DEM string. */
    feeDem: string
    /** Whether `feeOs` is within the configured `maxFee` ceiling. */
    withinFeeCap: boolean
    /** Node reference block the tx was confirmed against. */
    referenceBlock: number
}

/**
 * Decides whether a confirmed transaction should be broadcast. Return `true`
 * to broadcast, `false` to skip (the result reports `skippedReason: "rejected"`).
 */
export type ConfirmHook = (info: TxConfirmInfo) => boolean | Promise<boolean>

export interface ProgrammaticTxOptions {
    /**
     * Fee ceiling, in DEM. When the confirmed fee exceeds this in `"auto"`
     * mode the runner throws {@link FeeCapExceededError} rather than
     * broadcasting. Defaults to {@link DEFAULT_MAX_FEE_DEM} (5 DEM). Pass
     * `null` or `Infinity` to disable the cap entirely.
     */
    maxFee?: number | string | null

    /**
     * Confirmation strategy:
     *  - `"auto"` (default): broadcast automatically, subject to `maxFee`.
     *  - `"manual"`: build + sign + confirm only; return the validity data
     *    without broadcasting (the classic three-step flow, collapsed to one
     *    call for the confirm stage).
     *  - a {@link ConfirmHook}: called with the fee/validity snapshot; the tx
     *    is broadcast only if it returns `true`. `maxFee` is not auto-enforced
     *    in this mode — the callback is the sole authority.
     */
    confirm?: "auto" | "manual" | ConfirmHook

    /**
     * When broadcasting, wait for on-chain inclusion via `broadcastAndWait`
     * instead of returning after the broadcast RPC. Defaults to `false`.
     */
    wait?: boolean

    /** Options forwarded to `broadcastAndWait` when `wait` is `true`. */
    waitOptions?: { timeoutMs?: number; pollIntervalMs?: number }
}

/** Why a confirmed transaction was not broadcast. */
export type SkippedReason = "manual" | "rejected"

/**
 * Uniform result of a programmatic transaction. `broadcasted` tells you
 * whether the tx actually hit the network; everything needed to broadcast
 * later (in `"manual"` mode) is on `validityData`.
 */
export interface ProgrammaticTxResult {
    /** `true` if the transaction was broadcast to the network. */
    broadcasted: boolean
    /** Set when `broadcasted` is `false`, explaining why. */
    skippedReason?: SkippedReason
    /** The signed, confirmed transaction. */
    transaction: Transaction
    /** Transaction hash (as confirmed by the node). */
    hash: string
    /** Raw validity data from `confirm`. */
    validityData: RPCResponseWithValidityData
    /** Broadcast response, present only when `broadcasted` is `true`. */
    broadcast?: RPCResponse
    /** Total fee, in OS (smallest unit). */
    feeOs: bigint
    /** Total fee, human-readable DEM string. */
    feeDem: string
}
