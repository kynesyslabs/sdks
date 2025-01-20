/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromSignatureTargetIdentityPayload {
    chain: string
    subchain: string
    chainId: number | string
    isEVM: boolean

    signature: string
    signedData: string
    targetAddress: string
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromWriteTargetIdentityPayload {
    chain: string
    txHash: string
    targetAddress: string
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

export interface RemoveIdentityPayload {
    method: "remove_identity"

    /**
     * The identity of the target address to remove from the Demos identity
     */
    target_identity: {
        chain: string
        subchain: string
        targetAddress: string
    }
}
