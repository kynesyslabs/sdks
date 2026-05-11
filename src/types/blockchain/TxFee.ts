/**
 * Transaction fee container.
 *
 * Wire-format compatibility note: pre-fork wire encodes each field as a JS
 * `number` in DEM. Post-fork wire encodes them as decimal strings in OS
 * (smallest unit, 1 DEM = 10^9 OS). Both shapes are accepted on input; the
 * SDK's `serializerGate` (P4 commit 2) is the wire boundary that picks the
 * correct on-the-wire shape per the connected node's fork status.
 *
 * Internally, fee math is performed in `bigint` OS via `denomination`
 * conversion utilities — never as `number` (which loses precision above
 * 2^53 OS, ~9 million DEM).
 */
export interface TxFee {
    network_fee: number | string
    rpc_fee: number | string
    additional_fee: number | string
    /**
     * Ed25519 public key (lowercase hex, `0x` + 64 hex chars = 66 chars
     * total) of the RPC node that validated this transaction.
     *
     * DEM-665 (gas fee separation): post-fork, the validating node sets
     * this field during `confirmTransaction` to its own signing pubkey
     * so the fee-distribution edits can route the `rpc_fee` portion to
     * the correct account.
     *
     * Wire-format compatibility:
     * - Pre-fork node: field is `null` (or absent) — the legacy lump-sum
     *   gas path has no rpc-routing notion.
     * - Post-fork node: required; the post-fork serializer
     *   (`serializerGate.ts`) emits the hex string. The DB column is
     *   nullable so historical pre-fork rows persist with `null`.
     */
    rpc_address: string | null
}
