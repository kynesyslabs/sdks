
// SECTION Blockchain Identities

export interface XMCoreTargetIdentityPayload {
    chain: string
    subchain: string
    targetAddress: string
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromSignatureTargetIdentityPayload
    extends XMCoreTargetIdentityPayload {
    chainId: number | string
    isEVM: boolean

    signature: string
    signedData: string
    targetAddress: string
    publicKey?: string
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromWriteTargetIdentityPayload
    extends XMCoreTargetIdentityPayload {
    txHash: string
    isEVM: boolean
    chainId: number | string
    rpcUrl?: string
}

// Interface for the payload of the inferIdentityFromWrite method
export interface InferFromWritePayload {
    method: "identity_assign_from_write"
    /**
     * The identity of the target address to bind to the Demos identity
     */
    target_identity: InferFromWriteTargetIdentityPayload
}

// Interface for the payload of the inferIdentityFromSignature method
export interface InferFromSignaturePayload {
    method: "identity_assign_from_signature"
    /**
     * The identity of the target address to bind to the Demos identity
     */
    target_identity: InferFromSignatureTargetIdentityPayload
}

// SECTION Web2 Identities

export interface Web2CoreTargetIdentityPayload {
    context: string
    proof: string
}

// ANCHOR Proof types

export type GithubProof = `https://github.com/${string}/${string}` // TODO Better scope for gists

// Add more as needed following the above pattern

// ANCHOR Payloads

export interface InferFromGithubPayload extends Web2CoreTargetIdentityPayload {
    proof: GithubProof
}
