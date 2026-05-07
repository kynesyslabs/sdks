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
 *
 * Consumers should normalise via the denomination helpers, **not**
 * `BigInt(...)`, because:
 *
 * - `BigInt(numberWithFractional)` throws `RangeError`.
 * - `BigInt("non-numeric")` throws `SyntaxError`.
 * - `BigInt(...)` does not validate decimal-string OS canonicality —
 *   indexer responses can arrive with whitespace, leading zeros, or
 *   signed-integer notation.
 *
 * Recommended:
 *
 * - `denomination.parseOsString(value)` for OS decimal-string inputs
 *   (post-fork wire). Strips noise and validates the integer shape.
 * - `denomination.demToOs(value)` for DEM `number` inputs (pre-fork
 *   wire). Validates and converts to OS bigint.
 *
 * Branch on the source's known fork status (e.g. via
 * `demos.getNetworkInfo()`), not on `typeof value` — the literal `"5"`
 * could be either a pre-fork DEM string or a post-fork OS string,
 * which differ by a factor of 10^9.
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
