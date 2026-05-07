/**
 * Dual-format transaction-content serializer.
 *
 * This is the SDK-side mirror of the node's `forks/serializerGate.ts`. It
 * stringifies a `TransactionContent` for hashing/signing and chooses
 * between two wire shapes based on the connected node's fork status:
 *
 *  - **Pre-fork**: legacy DEM-`number` JSON. Any internal `bigint` OS
 *    amounts are coerced back to JS `number` in DEM via integer division
 *    by `OS_PER_DEM`, and the rest of the content is passed through
 *    `JSON.stringify` verbatim.
 *  - **Post-fork**: OS-decimal-string JSON. The top-level `amount`,
 *    every `transaction_fee.*` field, and the per-entry `amount` field
 *    on every `gcr_edits[]` entry that carries one (`balance` and
 *    `escrow.data.amount`) are converted to canonical OS strings. All
 *    other fields are passed through verbatim.
 *
 * Property order is consensus-critical: the node hashes the result of
 * `JSON.stringify`, which serializes keys in insertion order. The
 * implementation uses object spread (`{ ...content, amount, ... }`) which
 * preserves the source's insertion order and overwrites the
 * wire-sensitive fields in place without reordering them.
 *
 * The branching is by node fork status (a boolean), not by block height
 * — the SDK doesn't see blocks. Detection of that boolean lives in
 * `Demos.getNetworkInfo()` (see P4 commit 3) and is cached per-instance.
 *
 * @module denomination/serializerGate
 */

import type {
    TransactionContent,
} from "@/types/blockchain/Transaction"
import type { GCREdit } from "@/types/blockchain/GCREdit"
import type { TxFee } from "@/types/blockchain/TxFee"

import { OS_PER_DEM } from "./constants"
import { demToOs, parseOsString, toOsString } from "./conversion"

// REVIEW: P4 commit 2 — load-bearing wire boundary. Mirrors the node's
// `serializeTransactionContent` (forks/serializerGate.ts) byte for byte
// for post-fork output; pre-fork output is identical to the legacy
// `JSON.stringify(content)` path the SDK has used since v1.

/**
 * Coerce a wire-format amount/fee value to an OS `bigint`.
 *
 * Accepts:
 * - `bigint`: returned as-is.
 * - `string`: parsed as a canonical OS decimal integer string (post-fork
 *   wire shape).
 * - `number`: treated as DEM (pre-fork wire shape) and converted to OS.
 *
 * Throws on un-coercible inputs (non-numeric strings, fractional numbers
 * smaller than 1 OS, negative results — all surfaced by the underlying
 * `denomination` helpers).
 *
 * @internal
 */
function toOsBigint(value: number | string | bigint): bigint {
    if (typeof value === "bigint") {
        return value
    }
    if (typeof value === "string") {
        return parseOsString(value)
    }
    return demToOs(value)
}

/**
 * Coerce an OS-bigint back to a DEM JS `number` for legacy wire shape.
 *
 * Used by the pre-fork branch when an internal bigint amount needs to go
 * onto the wire as the legacy DEM-number. Performs an integer division
 * by `OS_PER_DEM`; the caller is responsible for ensuring the input has
 * no sub-DEM precision (the public-API guard in P4 commit 3 enforces
 * this before we get here).
 *
 * @internal
 */
function osToDemNumber(os: bigint): number {
    return Number(os / OS_PER_DEM)
}

/**
 * Normalise an `amount`/fee field for the **pre-fork** wire shape.
 *
 * - `bigint` (internal OS) → `number` (DEM, legacy wire).
 * - `string` (post-fork OS) → `number` (DEM). This path is entered when
 *   a v3 caller has already produced post-fork-shaped content but the
 *   connected node turned out to be pre-fork. The serializer is the
 *   last chance to coerce.
 * - `number` (legacy DEM) → returned unchanged.
 *
 * @internal
 */
function toPreForkWireNumber(value: number | string | bigint): number {
    if (typeof value === "number") return value
    return osToDemNumber(toOsBigint(value))
}

/**
 * Normalise an `amount`/fee field for the **post-fork** wire shape.
 *
 * - `bigint` (internal OS) → canonical OS decimal string.
 * - `number` (legacy DEM) → DEM-to-OS conversion → canonical OS string.
 * - `string` → re-parsed and re-emitted as a canonical OS string. This
 *   normalises non-canonical shapes (`"00100"`, `" 100 "`) to `"100"`
 *   so the hash matches the node's `transformToOsTransactionContent`
 *   output.
 *
 * @internal
 */
function toPostForkWireString(value: number | string | bigint): string {
    return toOsString(toOsBigint(value))
}

/**
 * Walk a single `GCREdit` entry and rewrite its embedded amount fields
 * for the post-fork wire shape. The two carriers we touch (per SPEC_P4
 * §2.2) are:
 *
 *   - `GCREditBalance.amount`  — top-level numeric balance edit.
 *   - `GCREditEscrow.data.amount` — nested escrow deposit amount.
 *
 * Other variants (`nonce`, `assign`, `identity`, `smartContract`,
 * `storageProgram`, `tlsnotary`, `validatorStake`,
 * `networkUpgrade`, `networkUpgradeVote`) are passed through unchanged.
 * `validatorStake.amount` is already a bigint-as-string by construction
 * (see GCREdit.ts:258); we still re-parse and re-emit through
 * `toPostForkWireString` so non-canonical inputs are normalised.
 *
 * Object spread preserves key order; the targeted overwrites do not
 * change the position of any existing key.
 *
 * @internal
 */
function transformEditPostFork(edit: GCREdit): GCREdit {
    if (edit.type === "balance") {
        return {
            ...edit,
            amount: toPostForkWireString(edit.amount),
        }
    }
    if (edit.type === "escrow") {
        const data = edit.data ?? {}
        if (typeof data.amount === "undefined" || data.amount === null) {
            return edit
        }
        return {
            ...edit,
            data: {
                ...data,
                amount: toPostForkWireString(
                    data.amount as number | string | bigint,
                ),
            },
        }
    }
    if (edit.type === "validatorStake") {
        // Already string-typed in the static type, but normalise anyway.
        return {
            ...edit,
            amount: toPostForkWireString(
                edit.amount as unknown as number | string | bigint,
            ),
        }
    }
    return edit
}

/**
 * Rewrite a single `GCREdit` for the **pre-fork** wire shape.
 *
 * Symmetric to {@link transformEditPostFork} but emits legacy DEM
 * numbers. Used when SDK v3 callers have already populated edits with
 * OS-strings/bigints (commit 1's widened types) but the connected node
 * is pre-fork.
 *
 * @internal
 */
function transformEditPreFork(edit: GCREdit): GCREdit {
    if (edit.type === "balance") {
        return {
            ...edit,
            amount: toPreForkWireNumber(edit.amount),
        }
    }
    if (edit.type === "escrow") {
        const data = edit.data ?? {}
        if (typeof data.amount === "undefined" || data.amount === null) {
            return edit
        }
        return {
            ...edit,
            data: {
                ...data,
                // Pre-fork escrow.data.amount was a JS number historically.
                amount: toPreForkWireNumber(
                    data.amount as number | string | bigint,
                ),
            },
        }
    }
    return edit
}

/**
 * Re-emit a `TransactionContent` with `amount`, `transaction_fee.*`, and
 * each `gcr_edits[]` entry's amount fields encoded as canonical OS
 * decimal strings.
 *
 * Property order is preserved by spreading the source content first and
 * then overwriting the wire-sensitive fields in place. This is the
 * post-fork branch's analogue to the node's
 * `transformToOsTransactionContent`. The SDK additionally walks
 * `gcr_edits[]` here because, unlike the node's serializer, the SDK is
 * the source of truth for those entries — the node's serializer
 * intentionally does not transform them.
 *
 * @internal
 */
function transformToPostFork(content: TransactionContent): TransactionContent {
    const transformed: TransactionContent = { ...content }

    if (typeof content.amount !== "undefined" && content.amount !== null) {
        transformed.amount = toPostForkWireString(
            content.amount as number | string | bigint,
        )
    }

    if (content.transaction_fee) {
        const fee = content.transaction_fee
        const transformedFee: TxFee = {
            network_fee: toPostForkWireString(
                fee.network_fee as number | string | bigint,
            ),
            rpc_fee: toPostForkWireString(
                fee.rpc_fee as number | string | bigint,
            ),
            additional_fee: toPostForkWireString(
                fee.additional_fee as number | string | bigint,
            ),
        }
        transformed.transaction_fee = transformedFee
    }

    if (Array.isArray(content.gcr_edits)) {
        transformed.gcr_edits = content.gcr_edits.map(transformEditPostFork)
    }

    return transformed
}

/**
 * Re-emit a `TransactionContent` for the **pre-fork** wire shape.
 *
 * Coerces any `bigint` (internal) or `string` (post-fork-shaped)
 * amount/fee fields back to JS `number` in DEM, walks `gcr_edits[]` to
 * do the same, and otherwise passes the content through verbatim.
 *
 * Why this exists: SDK v3's internal arithmetic uses `bigint` OS even
 * when talking to a pre-fork node. Without this normaliser the legacy
 * wire would carry stringified bigints and break hash equality on the
 * receiving side.
 *
 * @internal
 */
function transformToPreFork(content: TransactionContent): TransactionContent {
    const transformed: TransactionContent = { ...content }

    if (typeof content.amount !== "undefined" && content.amount !== null) {
        transformed.amount = toPreForkWireNumber(
            content.amount as number | string | bigint,
        )
    }

    if (content.transaction_fee) {
        const fee = content.transaction_fee
        const transformedFee: TxFee = {
            network_fee: toPreForkWireNumber(
                fee.network_fee as number | string | bigint,
            ),
            rpc_fee: toPreForkWireNumber(
                fee.rpc_fee as number | string | bigint,
            ),
            additional_fee: toPreForkWireNumber(
                fee.additional_fee as number | string | bigint,
            ),
        }
        transformed.transaction_fee = transformedFee
    }

    if (Array.isArray(content.gcr_edits)) {
        transformed.gcr_edits = content.gcr_edits.map(transformEditPreFork)
    }

    return transformed
}

/**
 * Serialize transaction content for hashing/signing.
 *
 * This is the load-bearing wire boundary: the bytes returned here are
 * fed into `sha256` and the resulting hash is what the keypair signs.
 * The receiving node hashes its in-memory `TransactionContent` through
 * its own `serializerGate.serializeTransactionContent`; if our bytes
 * differ from the node's bytes the signature will not validate.
 *
 * @param content - The transaction content to serialize.
 * @param isPostFork - `true` when the connected node has activated the
 *   `osDenomination` fork. When `false` (pre-fork or unknown), the
 *   legacy DEM-number wire shape is emitted.
 * @returns Canonical JSON string for hashing.
 */
export function serializeTransactionContent(
    content: TransactionContent,
    isPostFork: boolean,
): string {
    if (isPostFork) {
        return JSON.stringify(transformToPostFork(content))
    }
    return JSON.stringify(transformToPreFork(content))
}
