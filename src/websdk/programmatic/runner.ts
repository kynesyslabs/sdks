import { demToOs, osToDem } from "@/denomination"
import type { Transaction } from "@/types"
import type { RPCResponseWithValidityData } from "@/types/communication/rpc"
import type { TxFee } from "@/types/blockchain/TxFee"
import type { Demos } from "../demosclass"
import { FeeCapExceededError } from "./errors"
import {
    DEFAULT_MAX_FEE_DEM,
    type ProgrammaticTxOptions,
    type ProgrammaticTxResult,
    type TxConfirmInfo,
    type TxSource,
} from "./types"

/**
 * Normalise a single {@link TxFee} field to OS (`bigint`).
 *
 * Wire-format compatibility (see `TxFee` docs):
 *  - pre-fork node: `number` in DEM,
 *  - post-fork node: decimal `string` in OS.
 *
 * A defensive `"."`-in-string branch treats decimal strings as DEM so a
 * mixed/legacy shape can never be misread as a huge OS integer.
 */
function feeFieldToOs(value: number | string | null | undefined): bigint {
    if (value == null) return 0n
    if (typeof value === "number") return demToOs(value)
    const s = value.trim()
    if (s === "") return 0n
    // Decimal string ⇒ DEM (human) shape; integer string ⇒ OS (wire) shape.
    return s.includes(".") ? demToOs(s) : BigInt(s)
}

/** Sum `network_fee + rpc_fee + additional_fee` into a single OS `bigint`. */
export function totalFeeOs(
    validityData: RPCResponseWithValidityData,
): bigint {
    const fees = validityData?.response?.data?.gas_operation?.fees as
        | TxFee
        | undefined
    if (!fees) return 0n
    return (
        feeFieldToOs(fees.network_fee) +
        feeFieldToOs(fees.rpc_fee) +
        feeFieldToOs(fees.additional_fee)
    )
}

/**
 * Resolve the configured fee ceiling to OS. Returns `null` when the cap is
 * disabled (`maxFee` is `null` or a non-finite number like `Infinity`).
 */
function resolveCapOs(maxFee: ProgrammaticTxOptions["maxFee"]): bigint | null {
    if (maxFee === null) return null
    if (maxFee === undefined) return demToOs(DEFAULT_MAX_FEE_DEM)
    if (typeof maxFee === "number" && !Number.isFinite(maxFee)) return null
    return demToOs(maxFee)
}

/** Distinguish an already-confirmed validity-data object from a Transaction. */
function isValidityData(
    v: Transaction | RPCResponseWithValidityData,
): v is RPCResponseWithValidityData {
    return (
        v != null &&
        typeof v === "object" &&
        "response" in v &&
        (v as RPCResponseWithValidityData).response?.data !== undefined
    )
}

/**
 * Turn any {@link TxSource} into an `RPCResponseWithValidityData`:
 *  - a thunk is invoked,
 *  - an already-confirmed value is returned as-is (pattern B, e.g. the
 *    `Identities.*` builders),
 *  - a `Transaction` is signed if needed, then confirmed (pattern A).
 */
async function resolveToConfirmed(
    demos: Demos,
    source: TxSource,
): Promise<RPCResponseWithValidityData> {
    const resolved =
        typeof source === "function" ? await source() : source

    if (isValidityData(resolved)) {
        return resolved
    }

    const tx = resolved as Transaction
    const signed = tx.signature ? tx : await demos.sign(tx)
    return await demos.confirm(signed)
}

/**
 * The shared programmatic-transaction runner — the single place where
 * `confirm → (fee cap / callback) → broadcast` lives.
 *
 * Every typed one-call method (`demos.run.pay`, `demos.run.attest.*`,
 * `demos.run.tokens.*`, …) builds/signs its transaction and hands it here,
 * so confirmation policy and result shape are uniform across the SDK.
 *
 * @param demos - The connected Demos instance.
 * @param source - A signed/unsigned tx, an already-confirmed validityData,
 *                 or a thunk producing either.
 * @param opts - Fee ceiling, confirmation strategy and wait behaviour.
 * @returns A uniform {@link ProgrammaticTxResult}.
 */
export async function runProgrammaticTx(
    demos: Demos,
    source: TxSource,
    opts: ProgrammaticTxOptions = {},
): Promise<ProgrammaticTxResult> {
    const validityData = await resolveToConfirmed(demos, source)
    const transaction = validityData.response.data.transaction
    const hash = transaction?.hash
    const referenceBlock = validityData.response.data.reference_block

    const feeOs = totalFeeOs(validityData)
    const feeDem = osToDem(feeOs)
    const capOs = resolveCapOs(opts.maxFee)
    const withinFeeCap = capOs === null || feeOs <= capOs

    const info: TxConfirmInfo = {
        transaction,
        validityData,
        feeOs,
        feeDem,
        withinFeeCap,
        referenceBlock,
    }

    const mode = opts.confirm ?? "auto"

    // "manual": stop after confirm, hand back the validity data unbroadcast.
    if (mode === "manual") {
        return {
            broadcasted: false,
            skippedReason: "manual",
            transaction,
            hash,
            validityData,
            feeOs,
            feeDem,
        }
    }

    // Decide whether to broadcast.
    let allowed: boolean
    if (typeof mode === "function") {
        allowed = await mode(info)
    } else {
        // "auto": enforce the fee ceiling loudly.
        if (!withinFeeCap) {
            throw new FeeCapExceededError(feeOs, capOs as bigint, info)
        }
        allowed = true
    }

    if (!allowed) {
        return {
            broadcasted: false,
            skippedReason: "rejected",
            transaction,
            hash,
            validityData,
            feeOs,
            feeDem,
        }
    }

    const broadcast = opts.wait
        ? await demos.broadcastAndWait(validityData, opts.waitOptions)
        : await demos.broadcast(validityData)

    return {
        broadcasted: true,
        transaction,
        hash,
        validityData,
        broadcast,
        feeOs,
        feeDem,
    }
}
