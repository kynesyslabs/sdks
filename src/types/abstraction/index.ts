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

/**
 * NOTE: The payload for the inferIdentityFromWeb2 method contains a context (e.g. "github", "twitter", "telegram", etc.) 
 *  and a proof (e.g. a link to the actual proof of the identity).
 * 
 *  The context is used to identify the type of identity being provided, and the proof is the actual proof of the identity.
 * 
 *  The proof is a string that contains the proof of the identity usually in the form of a link to the proof.
 * 
 * 
 */
export interface Web2CoreTargetIdentityPayload {
    context: string
    proof: string
}

// ANCHOR Github Identities

export type GithubProof = `https://github.com/${string}/${string}` // TODO Better scope for gists

// Add more as needed following the above pattern

// ANCHOR Payloads
export interface InferFromGithubPayload extends Web2CoreTargetIdentityPayload {
    proof: GithubProof
}

// ANCHOR X Identities (aka Twitter Identities)

export type XProof = `https://x.com/${string}/${string}` // TODO Better scope for X posts
export type TwitterProof = XProof

export interface InferFromXPayload extends Web2CoreTargetIdentityPayload {
    proof: XProof
}

export interface InferFromTwitterPayload extends InferFromXPayload {}

export interface IdentityPayload {
    context: "xm" | "web2"
    method: "identity_assign" | "identity_remove"
    payload:
        | InferFromGithubPayload
        | InferFromSignaturePayload
        | InferFromWritePayload
        | XMCoreTargetIdentityPayload
}