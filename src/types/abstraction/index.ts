// Interface for the payload of the inferIdentityFromWrite method
export interface InferFromWritePayload {
    method: "identity_assign_from_write"
    demos_identity: {
        address: string
        signedData: string
        signature: string
    } // The identity of the sender within the Demos network
    target_identity: {
        txHash: string
        targetAddress: string
        isEVM: boolean
        chainId: number | string
        rpcUrl?: string
    } // The identity of the target address to bind to the Demos identity
}

// Interface for the payload of the inferIdentityFromSignature method
export interface InferFromSignaturePayload {
    method: "identity_assign_from_signature"
    demos_identity: {
        address: string
        signedData: string
        signature: string
    } // The identity of the sender within the Demos network
    target_identity: {
        signature: string
        signedData: string
        targetAddress: string
        isEVM: boolean
        chainId: number | string
    } // The identity of the target address to bind to the Demos identity
}
