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
}
