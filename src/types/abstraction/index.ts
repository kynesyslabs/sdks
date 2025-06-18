// SECTION Blockchain Identities

import { SigningAlgorithm } from "../cryptography"

export interface XMCoreTargetIdentityPayload {
    chain: string
    subchain: string
    targetAddress: string
    isEVM: boolean
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromSignatureTargetIdentityPayload
    extends XMCoreTargetIdentityPayload {
    chainId: number | string
    signature: string
    targetAddress: string
    signedData: string
    publicKey?: string
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromWriteTargetIdentityPayload
    extends XMCoreTargetIdentityPayload {
    txHash: string
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


export interface BaseXmIdentityPayload {
    context: "xm"
}

export interface XmIdentityAssignPayload extends BaseXmIdentityPayload {
    method: "xm_identity_assign"
    payload: InferFromSignaturePayload | InferFromWritePayload
}

export interface XmIdentityRemovePayload extends BaseXmIdentityPayload {
    method: "xm_identity_remove"
    payload: XMCoreTargetIdentityPayload
}

export type XmIdentityPayload = XmIdentityAssignPayload | XmIdentityRemovePayload

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
    username: string
    userId: string
}

// ANCHOR Github Identities
type GistProofUrl = `https://gist.github.com/${string}/${string}`
type RawGistProofUrl = `https://gist.githubusercontent.com/${string}/${string}`
type RawGithubProofUrl = `https://raw.githubusercontent.com/${string}/${string}`

export type GithubProof = RawGistProofUrl | GistProofUrl | RawGithubProofUrl

// Add more as needed following the above pattern

// ANCHOR Payloads
export interface InferFromGithubPayload extends Web2CoreTargetIdentityPayload {
    context: "github"
    proof: GithubProof
}

// ANCHOR X Identities (aka Twitter Identities)
export type XProof = `https://x.com/${string}/${string}` // TODO Better scope for X posts
export type TwitterProof = XProof

export interface InferFromXPayload extends Web2CoreTargetIdentityPayload {
    context: "twitter"
    username: string
    userId: string
}

export interface InferFromTwitterPayload extends InferFromXPayload { }

// SECTION Web2 Identities
export interface BaseWeb2IdentityPayload {
    context: "web2"
    // method: "web2_identity_assign" | "web2_identity_remove"
    // payload: InferFromGithubPayload | InferFromTwitterPayload
}

export interface Web2IdentityAssignPayload extends BaseWeb2IdentityPayload {
    method: "web2_identity_assign"
    payload: InferFromGithubPayload | InferFromTwitterPayload
}

export interface Web2IdentityRemovePayload extends BaseWeb2IdentityPayload {
    method: "web2_identity_remove"
    payload: {
        context: string
        username: string
    }
}

export type Web2IdentityPayload = Web2IdentityAssignPayload | Web2IdentityRemovePayload

// SECTION PQC Identities
export interface BasePqcIdentityPayload {
    context: "pqc"
}

export interface PqcIdentityAssignPayload extends BasePqcIdentityPayload {
    method: "pqc_identity_assign"
    payload: {
        algorithm: "falcon" | "ml-dsa"
        address: string
        signature: string
    }[]
}

export interface PqcIdentityRemovePayload extends BasePqcIdentityPayload {
    method: "pqc_identity_remove"
    payload: {
        algorithm: "falcon" | "ml-dsa"
        address: string
    }[]
}

export type PqcIdentityPayload = PqcIdentityAssignPayload | PqcIdentityRemovePayload

// SECTION Final payload type
export type IdentityPayload = XmIdentityPayload | Web2IdentityPayload | PqcIdentityPayload
export interface UserPoints {
    userId: string
    totalPoints: number
    breakdown: {
        web3Wallets: { [chain: string]: number }
        socialAccounts: {
            twitter: number
            github: number
            discord: number
        }
    }
    linkedWallets: string[]
    linkedSocials: { twitter?: string }
    lastUpdated: Date
}
