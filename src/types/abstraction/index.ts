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
    referralCode?: string
}

// Interface for the payload of the inferIdentityFromSignature method
export interface InferFromSignaturePayload {
    method: "identity_assign_from_signature"
    /**
     * The identity of the target address to bind to the Demos identity
     */
    target_identity: InferFromSignatureTargetIdentityPayload
    referralCode?: string
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

export type XmIdentityPayload =
    | XmIdentityAssignPayload
    | XmIdentityRemovePayload

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
    proof: string | TelegramProof
    username: string
    userId: string
    referralCode?: string
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
export type DiscordProof =
    | `https://discord.com/channels/${string}/${string}/${string}`
    | `https://ptb.discord.com/channels/${string}/${string}/${string}`
    | `https://canary.discord.com/channels/${string}/${string}/${string}`
    | `https://discordapp.com/channels/${string}/${string}/${string}`

export interface InferFromXPayload extends Web2CoreTargetIdentityPayload {
    context: "twitter"
    username: string
    userId: string
}

export interface InferFromTwitterPayload extends InferFromXPayload {}

// ANCHOR Telegram Identities

/**
 * Telegram bot attestation payload structure
 */
export interface TelegramAttestationPayload {
    telegram_user_id: string
    challenge: string
    signature: string
    username: string
    public_key: string
    timestamp: number
    bot_address: string
}

/**
 * Signed attestation from Telegram bot containing dual signatures
 */
export interface TelegramSignedAttestation {
    payload: TelegramAttestationPayload
    signature: {
        type: SigningAlgorithm
        data: string
    }
}

/**
 * Telegram proof is a stringified signed attestation with dual signatures
 */
export type TelegramProof = TelegramSignedAttestation // JSON.stringify(TelegramSignedAttestation)

export interface InferFromTelegramPayload
    extends Web2CoreTargetIdentityPayload {
    context: "telegram"
    username: string
    userId: string
    proof: TelegramProof
}

export interface InferFromDiscordPayload extends Web2CoreTargetIdentityPayload {
    context: "discord"
    username: string
    userId: string
}

// SECTION Web2 Identities
export interface BaseWeb2IdentityPayload {
    context: "web2"
    // method: "web2_identity_assign" | "web2_identity_remove"
    // payload: InferFromGithubPayload | InferFromTwitterPayload
}

export interface Web2IdentityAssignPayload extends BaseWeb2IdentityPayload {
    method: "web2_identity_assign"
    payload:
        | InferFromGithubPayload
        | InferFromTwitterPayload
        | InferFromTelegramPayload
        | InferFromDiscordPayload
}

export interface Web2IdentityRemovePayload extends BaseWeb2IdentityPayload {
    method: "web2_identity_remove"
    payload: {
        context: string
        username: string
    }
}

export type Web2IdentityPayload =
    | Web2IdentityAssignPayload
    | Web2IdentityRemovePayload

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

export type PqcIdentityPayload =
    | PqcIdentityAssignPayload
    | PqcIdentityRemovePayload

// SECTION Unstoppable Domains Identities
export interface BaseUdIdentityPayload {
    context: "ud"
}

/**
 * Unstoppable Domains identity payload
 *
 * Follows signature-based verification pattern (like XM identities)
 * User signs challenge with domain's resolved Ethereum address
 */
export interface UDIdentityPayload {
    domain: string              // e.g., "brad.crypto"
    resolvedAddress: string     // Ethereum address domain resolves to
    signature: string           // Signature from resolvedAddress
    publicKey: string           // Public key of resolvedAddress
    signedData: string          // Challenge message that was signed
}

export interface UDIdentityAssignPayload extends BaseUdIdentityPayload {
    method: "ud_identity_assign"
    payload: UDIdentityPayload
    referralCode?: string
}

export interface UDIdentityRemovePayload extends BaseUdIdentityPayload {
    method: "ud_identity_remove"
    payload: {
        domain: string
    }
}

export type UdIdentityPayload =
    | UDIdentityAssignPayload
    | UDIdentityRemovePayload

// SECTION Final payload type
export type IdentityPayload =
    | XmIdentityPayload
    | Web2IdentityPayload
    | PqcIdentityPayload
    | UdIdentityPayload
export interface UserPoints {
    userId: string
    referralCode: string
    totalPoints: number
    breakdown: {
        web3Wallets: { [chain: string]: number }
        socialAccounts: {
            twitter: number
            github: number
            discord: number
            telegram: number
        }
        referrals: number
        demosFollow: number
    }
    linkedWallets: string[]
    linkedSocials: { twitter?: string }
    lastUpdated: Date
    flagged: boolean | null
    flaggedReason: string | null
}

export interface FindDemosIdByWeb2IdentityQuery {
    type: "web2"
    context: "twitter" | "telegram" | "github" | "discord"
    username: string
    userId?: string
}

export interface FindDemosIdByWeb3IdentityQuery {
    type: "xm"
    chain: string // eg. "eth.mainnet" | "solana.mainnet", etc.
    address: string
}