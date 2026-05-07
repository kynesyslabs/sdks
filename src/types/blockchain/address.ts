interface Content {
    txs: null
    nonce: null
    balance: string
    identities: null
}

interface Details {
    hash: string
    content: Content
}

interface Extended {
    xm: any[]
    nfts: any[]
    web2: any[]
    other: any[]
    tokens: any[]
}

/**
 * Snapshot of an address's on-chain state.
 *
 * P4: `balance` is `bigint` in **OS** (smallest unit, 1 DEM = 10^9 OS).
 * Convert via `denomination.osToDem(balance)` for display. Pre-fork
 * `getAddressInfo` returns DEM-magnitude `bigint` (multiplied by 10^9
 * client-side via `osToDem` for backward compatibility); post-fork the
 * node already returns OS magnitudes.
 */
export interface AddressInfo {
    pubkey: string
    assignedTxs: string[]
    identities: {
        xm: Map<string, string[]>
        web2: Map<string, string[]>
    }
    nonce: number
    /** Address balance, `bigint` in OS (smallest unit). */
    balance: bigint
}
