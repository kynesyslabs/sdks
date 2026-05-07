/**
 * Native chain status snapshot for an address.
 *
 * Wire-format compatibility (P4): `balance` may arrive as a JS `number`
 * (pre-fork node, DEM) or a decimal `string` (post-fork node, OS).
 * Consumers should normalise via `BigInt(...)` to OS internally before
 * arithmetic. Direct `Number(balance)` truncates above 2^53.
 */
export interface StatusNative {
    address: string
    balance: number | string
    nonce: number
    tx_list: string
}
