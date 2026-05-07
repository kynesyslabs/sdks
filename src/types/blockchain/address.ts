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
 * P4: `balance` is `bigint`. The magnitude depends on the connected
 * node's fork status:
 *
 * - **Post-fork**: the node returns balance in **OS** (smallest unit,
 *   1 DEM = 10^9 OS). The SDK passes this through unchanged.
 * - **Pre-fork**: the node returns balance in **DEM**. The SDK passes
 *   this through unchanged — it does **not** auto-convert client-side.
 *
 * Consumers that need to do arithmetic in OS regardless of node version
 * should branch on `demos.getNetworkInfo()` (or the internal
 * `_isPostForkCached`) and call `denomination.demToOs(balance)` only
 * on the pre-fork branch. For display, use `denomination.osToDem(balance)`
 * post-fork or treat the value as DEM directly pre-fork.
 *
 * (Earlier drafts of this doc claimed the SDK multiplied pre-fork
 * balances client-side via `osToDem`; that was inaccurate on both
 * counts — `osToDem` divides, and the SDK does not multiply at all.
 * Fixed in PR-86 review.)
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
