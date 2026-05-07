/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import forge from "node-forge"

/**
 * Indexer-style state change record. Wire-format compatibility (P4):
 * `nativeAmount`, `TokenTransfer.amount`, and `NFTTransfer.amount` may
 * arrive as JS `number` (pre-fork DEM) or decimal `string` (post-fork OS).
 * Consumers should normalise via `BigInt(...)` before arithmetic.
 */
interface TokenTransfer {
    address: string
    amount: number | string
}

interface NFTTransfer {
    address: string
    tokenId: string
    amount: number | string
}

export interface StateChange {
    // Structure for state change
    sender: forge.pki.ed25519.BinaryBuffer
    receiver: forge.pki.ed25519.BinaryBuffer
    nativeAmount: number | string
    tx_hash: string
    token: TokenTransfer
    nft: NFTTransfer
}
