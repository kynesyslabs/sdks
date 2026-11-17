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

/** A non-negative base-10 integer without sign, padding or leading zeros. */
const DECIMAL_INTEGER = /^(0|[1-9]\d*)$/

/**
 * Normalise a single {@link TxFee} field to OS (`bigint`).
 *
 * Wire-format compatibility (see `TxFee` docs):
 *  - pre-fork node: `number` in DEM,
 *  - post-fork node: decimal `string` in OS.
 *
 * A defensive `"."`-in-string branch treats decimal strings as DEM so a
 * mixed/legacy shape can never be misread as a huge OS integer.
 * `wholeIsDem` reads integer strings as DEM too, for a pre-fork fee quote.
 */
function feeFieldToOs(
    value: number | string | null | undefined,
    wholeIsDem = false,
): bigint {
    if (value == null) return 0n
    try {
        if (typeof value === "number") return demToOs(value)
        // Decimal string ⇒ DEM (human) shape; integer string ⇒ OS (wire) shape.
        if (value.includes(".") || wholeIsDem) return demToOs(value.trim())
        // Checked untrimmed: `BigInt` also reads hex, binary, octal, a sign
        // and surrounding whitespace, and reads a blank string as 0.
        if (typeof value !== "string" || !DECIMAL_INTEGER.test(value)) {
            throw new SyntaxError(String(value))
        }
        return BigInt(value)
    } catch {
        // The value comes from the node's confirm response — surface which
        // field/shape failed instead of a bare BigInt/demToOs SyntaxError.
        throw new Error(
            `[programmatic-tx] unparseable fee field ${JSON.stringify(
                value,
            )} in the node's confirm response`,
        )
    }
}

/**
 * node#1174's `isNativeSend`: the only transactions it quotes a fee for
 * (not other native operations such as `tlsn_request`).
 */
function isNativeSend(content: Transaction["content"] | undefined): boolean {
    const payload = content?.data?.[1] as
        | { nativeOperation?: unknown }
        | undefined
    return content?.type === "native" && payload?.nativeOperation === "send"
}

/**
 * The node's quote of the fee it will charge, `transaction.attrs.total_fee`
 * (native sends, kynesyslabs/node#1174), in OS; `null` when not quoted.
 *
 * The quote is in ledger units: whole DEM before the `osDenomination` fork,
 * OS after. A pre-fork node echoes the fee fields it accepted as `number`
 * DEM, so their shape tells which.
 *
 * A `total_fee` on anything other than a native send is ignored. For one,
 * only a missing `total_fee` means "not quoted"; a present value that is
 * not a non-negative base-10 integer string throws, and so does a quote
 * whose echoed `network_fee` is neither a number nor a string. A quote whose
 * `attrs.reference_block` is not this confirmation's `reference_block` was
 * not made for it (a node without node#1174 echoes `attrs` unchanged) and
 * is ignored.
 */
function quotedFeeOs(
    data: RPCResponseWithValidityData["response"]["data"] | undefined,
): bigint | null {
    const transaction = data?.transaction
    const quote: unknown = transaction?.attrs?.total_fee
    // node#1174 quotes native sends only; any other quote is not the node's.
    if (quote === undefined || !isNativeSend(transaction.content)) {
        return null
    }
    // Checked before conversion: `BigInt` and `demToOs` would also read
    // hex, a sign, padding or `_`, so a malformed quote could pass the cap.
    if (typeof quote !== "string" || !DECIMAL_INTEGER.test(quote)) {
        throw new Error(
            `[programmatic-tx] invalid fee quote ${JSON.stringify(
                quote,
            )} in the node's confirm response`,
        )
    }
    // The node sends no unit, so it is inferred from the echoed fee field's
    // type: the SDK serializer sends `number` DEM pre-fork and decimal-string
    // OS post-fork, and the node echoes the fee it received unchanged. Any
    // other type (missing, `null`) leaves the unit unknown, so it throws.
    const networkFee: unknown =
        transaction?.content?.transaction_fee?.network_fee
    if (typeof networkFee !== "number" && typeof networkFee !== "string") {
        throw new TypeError(
            `[programmatic-tx] invalid fee quote ${JSON.stringify(
                quote,
            )} in the node's confirm response: network_fee ${JSON.stringify(
                networkFee,
            )} does not tell its unit`,
        )
    }
    if (transaction.attrs.reference_block !== data.reference_block) return null
    return feeFieldToOs(quote, typeof networkFee === "number")
}

/**
 * The transaction's fee, in OS, from the node's confirm response.
 *
 * Prefers the node's quote of what it will charge
 * (`transaction.attrs.total_fee`), which can differ from the signed fee
 * fields. Without a quote (older nodes, other than native sends), sums
 * `network_fee + rpc_fee + additional_fee` from:
 *  - `gas_operation.fees` — the node's authoritative gas operation, when the
 *    node populates it (post-fork gas-separation model), preferred; else
 *  - `transaction.content.transaction_fee` — the fee carried on the confirmed
 *    transaction itself, which live nodes return with `gas_operation: null`.
 *
 * Returns `0n` when none is present (fee not exposed at confirm time).
 */
export function totalFeeOs(
    validityData: RPCResponseWithValidityData,
): bigint {
    const data = validityData?.response?.data
    const quoted = quotedFeeOs(data)
    if (quoted !== null) return quoted
    const fees = (data?.gas_operation?.fees ??
        data?.transaction?.content?.transaction_fee) as TxFee | undefined
    if (!fees) return 0n
    return (
        feeFieldToOs(fees.network_fee) +
        feeFieldToOs(fees.rpc_fee) +
        feeFieldToOs(fees.additional_fee)
    )
}

/**
 * Resolve the configured fee ceiling to OS. Returns `null` when the cap is
 * disabled — only `null` or `Infinity` disable it. `undefined` falls back to
 * the default ceiling. Any other value (including `NaN` or a non-numeric
 * string) is routed through `demToOs`, which throws loudly: silently
 * disabling the cap on a `NaN` from `Number(userInput)` would remove the very
 * safety this feature promises.
 */
function resolveCapOs(maxFee: ProgrammaticTxOptions["maxFee"]): bigint | null {
    if (maxFee === null) return null
    if (maxFee === undefined) return demToOs(DEFAULT_MAX_FEE_DEM)
    if (maxFee === Infinity) return null
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
        (v as RPCResponseWithValidityData).response?.data != null
    )
}

/**
 * Turn any {@link TxSource} into an `RPCResponseWithValidityData`:
 *  - a thunk is invoked,
 *  - an already-confirmed value is returned as-is (pattern B, e.g. the
 *    `Identities.*` builders), except a native send carrying a fee quote,
 *    which is refused,
 *  - a `Transaction` is signed if needed, then confirmed (pattern A).
 */
async function resolveToConfirmed(
    demos: Demos,
    source: TxSource,
    customNonce?: number,
): Promise<RPCResponseWithValidityData> {
    const resolved =
        typeof source === "function" ? await source() : source

    if (isValidityData(resolved)) {
        // A quote counts only from a confirmation this runner made without
        // an earlier quote (below): a node without kynesyslabs/node#1174
        // echoes `attrs`, so this one may be an earlier quote, not its own.
        const confirmed = resolved.response.data.transaction
        if (
            isNativeSend(confirmed?.content) &&
            confirmed.attrs?.total_fee !== undefined
        ) {
            throw new Error(
                "[programmatic-tx] this already-confirmed native send carries " +
                    "a fee quote (attrs.total_fee) the runner did not obtain; " +
                    "pass the transaction instead so the runner confirms it",
            )
        }
        return resolved
    }

    const tx = resolved as Transaction
    // A tx counts as signed only when its signature actually carries data.
    // Some builders (e.g. DemosTokens) return an UNSIGNED tx with a truthy
    // placeholder `signature: { type: "ed25519", data: "" }`, so a bare
    // `tx.signature` truthiness check would wrongly skip signing and confirm
    // an empty-signature tx. Gate on the signature payload instead.
    const sig = tx.signature as { data?: unknown } | null
    const isSigned = !!(sig && sig.data)
    const signed = isSigned
        ? tx
        : await demos.sign(
              tx,
              customNonce !== undefined ? { nonce: customNonce } : undefined,
          )
    // Drop a fee quote left by an earlier confirmation: it is not signed
    // (the hash and signature cover `content` only), and a node without
    // kynesyslabs/node#1174 would echo it back as if it were its own.
    if (
        signed.attrs &&
        typeof signed.attrs === "object" &&
        "total_fee" in signed.attrs
    ) {
        const { total_fee: _earlierQuote, ...attrs } = signed.attrs
        return await demos.confirm({ ...signed, attrs })
    }
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
    const validityData = await resolveToConfirmed(demos, source, opts.nonce)
    const transaction = validityData.response.data.transaction
    // A successful confirm always echoes the transaction; guard so the
    // non-optional `transaction`/`hash` on the result types stay truthful
    // (rather than silently handing callers `undefined.hash`).
    if (!transaction) {
        throw new Error(
            "[programmatic-tx] confirm response did not include a transaction",
        )
    }
    const hash = transaction.hash
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
