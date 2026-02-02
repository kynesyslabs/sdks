/**
 * Human Passport (formerly Gitcoin Passport) Type Definitions
 *
 * Human Passport provides Proof of Personhood through verified "Stamps" -
 * credentials from various web2/web3 providers that prove unique humanity.
 */

/**
 * Individual stamp credential from Human Passport
 */
export interface HumanPassportStamp {
    /** Provider name (e.g., "Google", "Discord", "GitHub") */
    provider: string
    /** Credential details */
    credential: {
        type: string
        hash: string
        issuanceDate: string
        expirationDate: string
    }
    /** Optional metadata about the stamp */
    metadata?: {
        name: string
        description: string
        group: string
    }
}

/**
 * Score response from Human Passport API
 */
export interface HumanPassportScore {
    /** Ethereum address (lowercase) */
    address: string
    /** Humanity score (0-100+) */
    score: number
    /** Whether score meets threshold (default: 20) */
    passingScore: boolean
    /** When score was last calculated */
    lastScoreTimestamp: string
    /** When score expires (if applicable) */
    expirationTimestamp: string | null
    /** Score threshold used */
    threshold: number
    /** Verified stamps */
    stamps: Record<string, HumanPassportStamp>
    /** Any error from API */
    error: string | null
}

/**
 * Payload for adding Human Passport identity to Demos
 */
export interface HumanPassportIdentityPayload {
    /** Identity context identifier */
    context: "humanpassport"
    /** EVM address being verified */
    address: string
    /** Humanity score at time of verification */
    score: number
    /** Whether score passed threshold */
    passingScore: boolean
    /** List of verified stamp provider names */
    stamps: string[]
    /** Signature proving address ownership */
    signature: string
    /** Verification method used */
    verificationMethod: "api" | "onchain"
    /** Chain ID for onchain verification */
    chainId?: number
    /** Optional referral code */
    referralCode?: string
}

/**
 * Stored Human Passport identity in GCR
 */
export interface SavedHumanPassportIdentity {
    /** EVM address */
    address: string
    /** Humanity score */
    score: number
    /** Whether score passed threshold */
    passingScore: boolean
    /** List of verified stamp provider names */
    stamps: string[]
    /** Verification method used */
    verificationMethod: "api" | "onchain"
    /** Chain ID for onchain verification */
    chainId?: number
    /** Timestamp when verified */
    verifiedAt: number
    /** Timestamp when score expires */
    expiresAt: number | null
}

/**
 * Configuration for Human Passport API client
 */
export interface HumanPassportConfig {
    /** API key from developer.passport.xyz */
    apiKey: string
    /** Scorer ID from developer portal */
    scorerId: string
    /** Base URL for API (default: https://api.passport.xyz) */
    baseUrl?: string
}

/**
 * Error codes for Human Passport operations
 */
export enum HumanPassportError {
    INVALID_ADDRESS = 'INVALID_ADDRESS',
    NO_PASSPORT = 'NO_PASSPORT',
    SCORE_BELOW_THRESHOLD = 'SCORE_BELOW_THRESHOLD',
    API_RATE_LIMITED = 'API_RATE_LIMITED',
    API_UNAVAILABLE = 'API_UNAVAILABLE',
    INVALID_SIGNATURE = 'INVALID_SIGNATURE',
    EXPIRED_SCORE = 'EXPIRED_SCORE',
    UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN'
}

/**
 * Custom exception for Human Passport errors
 */
export class HumanPassportException extends Error {
    constructor(
        public code: HumanPassportError,
        message: string,
        public details?: any
    ) {
        super(message)
        this.name = 'HumanPassportException'
    }
}
