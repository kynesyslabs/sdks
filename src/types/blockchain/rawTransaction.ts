/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { TransactionContent } from "./Transaction"

/**
 * Raw transaction row as it surfaces from the node's storage layer.
 *
 * Wire-format compatibility note (P4): `amount`, `networkFee`, `rpcFee`, and
 * `additionalFee` may arrive as either JS `number` (pre-fork node, DEM) or
 * decimal `string` (post-fork node, OS). Consumers must coerce via
 * `denomination.parseOsString` / `BigInt(...)` before doing arithmetic;
 * never call raw `Number(...)` once OS-magnitude values are possible.
 */
export interface RawTransaction {
    id: number
    blockNumber: number
    signature: string
    status: string
    hash: string
    content: NonNullable<string>
    type: TransactionContent["type"]
    from: any
    to: any
    amount: number | string
    nonce: number
    timestamp: number
    networkFee: number | string
    rpcFee: number | string
    additionalFee: number | string
    /**
     * RPC node ed25519 public key (lowercase hex, `0x` + 64 hex chars)
     * that validated this transaction. DEM-665: populated post-fork,
     * `null` on pre-fork rows. See {@link TxFee.rpc_address} for the
     * full contract.
     */
    rpcAddress: string | null
    ed25519_signature: string
    from_ed25519_address: string
}
