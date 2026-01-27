// ! Add the native operation types here (start with send)

interface INativeSend {
    nativeOperation: "send"
    args: [string, number] // [to, amount]
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
