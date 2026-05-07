// ! Add the native operation types here (start with send)

interface INativeSend {
    nativeOperation: "send"
    /**
     * `[to, amount]`. P4 dual-shape: `amount` may be a JS `number` (pre-fork
     * DEM) or decimal `string` (post-fork OS). Internal arithmetic uses
     * `bigint` OS via `denomination` utilities.
     */
    args: [string, number | string] // [to, amount]
}

// REVIEW: TLSNotary attestation request
interface INativeTlsnRequest {
    nativeOperation: "tlsn_request"
    args: [string] // [targetUrl]
}

// REVIEW: TLSNotary proof storage
interface INativeTlsnStore {
    nativeOperation: "tlsn_store"
    args: [string, string, "onchain" | "ipfs"] // [tokenId, proof, storageType]
}

export type INativePayload = INativeSend | INativeTlsnRequest | INativeTlsnStore
