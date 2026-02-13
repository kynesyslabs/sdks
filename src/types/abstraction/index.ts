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
export interface InferFromSignatureTargetIdentityPayload extends XMCoreTargetIdentityPayload {
    chainId: number | string
    signature: string
    targetAddress: string
    signedData: string
    publicKey?: string
    displayAddress?: string
}

/**
 * The identity of the target address to bind to the Demos identity
 */
export interface InferFromWriteTargetIdentityPayload extends XMCoreTargetIdentityPayload {
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
    group_membership: boolean
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

export interface InferFromTelegramPayload extends Web2CoreTargetIdentityPayload {
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
 * User signs challenge with any authorized address from domain records
 *
 * Multi-chain support: Polygon L2, Base L2, Sonic, Ethereum L1, and Solana
 * Multi-signature support: EVM (secp256k1) and Solana (ed25519)
 */
export interface UDIdentityPayload {
    domain: string // e.g., "brad.crypto"
    signingAddress: string // Address used to sign (from domain's authorized addresses)
    signatureType: "evm" | "solana" // Signature type: EVM (secp256k1) or Solana (ed25519)
    signature: string // Signature from signingAddress
    publicKey: string // Public key of Demos identity
    signedData: string // Challenge message that was signed
    network: "polygon" | "ethereum" | "base" | "sonic" | "solana" // Network where domain is registered (optional, auto-detected)
    registryType: "UNS" | "CNS" // Registry type (optional, auto-detected: UNS newer, CNS legacy)
    timestamp?: number // Auto-populated during GCR generation
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
// SECTION Nomis Identities
export interface NomisWalletIdentity {
    chain: string
    subchain: string
    address: string
    score: number
    scoreType: number
    mintedScore?: number | null
    lastSyncedAt: string
    metadata?: {
        referralCode?: string
        referrerCode?: string
        deadline?: number
        nonce?: number
        apiVersion?: string
        [key: string]: unknown
    }
}

export interface BaseNomisIdentityPayload {
    context: "nomis"
}

export interface NomisIdentityAssignPayload extends BaseNomisIdentityPayload {
    method: "nomis_identity_assign"
    payload: NomisWalletIdentity
}

export interface NomisIdentityRemovePayload extends BaseNomisIdentityPayload {
    method: "nomis_identity_remove"
    payload: NomisWalletIdentity
}

export type NomisIdentityPayload =
    | NomisIdentityAssignPayload
    | NomisIdentityRemovePayload

// SECTION TLSNotary Identities
/**
 * TLSNotary presentation format (from tlsn-js attestation)
 *
 * This is the proof structure returned by TLSNotary attestation.
 * Contains cryptographically signed proof of an HTTPS request/response.
 */
export interface TLSNotaryPresentation {
    /** TLSNotary version (e.g., "0.1.0-alpha.12") */
    version: string
    /** Hex-encoded proof data containing request/response and signatures */
    data: string
    /** Metadata about the attestation */
    meta: {
        notaryUrl?: string
        websocketProxyUrl?: string
    }
}

/**
 * Supported TLSN identity contexts
 */
export type TLSNIdentityContext = "github" | "discord" | "telegram"

/**
 * Generic Web2 identity payload via TLSNotary
 *
 * Used for verifying any Web2 identity through TLSNotary attestation.
 * The context determines which platform's API was attested.
 */
export interface InferFromTLSNPayload {
    /** The platform context (github, discord, telegram) */
    context: TLSNIdentityContext
    /** The TLSNotary presentation proof */
    proof: TLSNotaryPresentation
    recvHash: string
    /** Transcript byte ranges revealed in the proof */
    proofRanges: TLSNProofRanges
    /** Disclosed recv transcript bytes used for server-side hash check and identity extraction */
    revealedRecv: number[]
    /** Username from the proven response */
    username: string
    /** User ID from the proven response */
    userId: string
    /** Optional referral code */
    referralCode?: string
}

export type TranscriptRange = { start: number; end: number }

export type TLSNProofRanges = {
    recv: TranscriptRange[]
    sent: TranscriptRange[]
}

/**
 * Base TLSN identity payload
 */
export interface BaseTLSNIdentityPayload {
    context: "tlsn"
}

/**
 * TLSN identity assign payload
 */
export interface TLSNIdentityAssignPayload extends BaseTLSNIdentityPayload {
    method: "tlsn_identity_assign"
    payload: InferFromTLSNPayload
}

/**
 * TLSN identity remove payload
 */
export interface TLSNIdentityRemovePayload extends BaseTLSNIdentityPayload {
    method: "tlsn_identity_remove"
    payload: {
        context: string
        username: string
    }
}

export type TLSNIdentityPayload =
    | TLSNIdentityAssignPayload
    | TLSNIdentityRemovePayload

// SECTION Final payload type
export type IdentityPayload =
    | XmIdentityPayload
    | Web2IdentityPayload
    | PqcIdentityPayload
    | UdIdentityPayload
    | NomisIdentityPayload
    | TLSNIdentityPayload
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
            telegram?: number
        }
        udDomains?: { [domain: string]: number }
        nomisScores?: { [chain: string]: number }
        referrals: number
        demosFollow: number
    }
    linkedWallets: string[]
    linkedSocials: { twitter?: string }
    linkedUDDomains?: {
        [network: string]: string[]
    }
    linkedNomisIdentities: NomisWalletIdentity[]
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
