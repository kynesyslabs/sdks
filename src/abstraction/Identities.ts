// TODO Implement the identities abstraction
// This should be able to query and set the GCR identities for a Demos address

// Interface for the payload of the inferIdentityFromWrite method
export interface InferFromWritePayload {
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

export default class Identities {
    constructor() {}

    // Infer identity from either a write transaction or a signature
    async inferIdentity(payload: InferFromWritePayload | InferFromSignaturePayload): Promise<string | false> {
        const basePayload = {
            method: "gcr_routine",
            params: [payload],
        }
        // TODO Implement the RPC call
        return false
    }

}
