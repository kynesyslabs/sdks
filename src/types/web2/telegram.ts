/**
 * Telegram identity verification types for dApp integration
 */

/**
 * Request payload for generating a Telegram verification challenge
 */
export interface TelegramChallengeRequest {
    /** The Demos address requesting verification */
    demos_address: string
}

/**
 * Response containing the challenge to be signed by the user
 */
export interface TelegramChallengeResponse {
    /** The challenge string that must be signed by the user's wallet */
    challenge: string
}

/**
 * Response from Telegram identity verification attempt
 */
export interface TelegramVerificationResponse {
    /** Whether the verification was successful */
    success: boolean
    /** Human-readable message describing the result */
    message: string
    /** The verified Demos address (only present on success) */
    demosAddress?: string
    /** The verified Telegram identity data (only present on success) */
    telegramData?: {
        userId: string
        username: string
        timestamp: number
    }
    /** Unsigned identity transaction to be signed by user (only present on success) */
    unsignedTransaction?: any // Will be Transaction type, but avoiding circular imports
}

/**
 * Telegram user data structure
 */
export interface TelegramUser {
    /** Telegram user ID (unique identifier) */
    id: string
    /** Telegram username (optional, can be changed by user) */
    username?: string
    /** User's first name */
    first_name: string
    /** User's last name (optional) */
    last_name?: string
    /** Whether this user is a bot */
    is_bot: boolean
}

/**
 * Telegram verification payload sent by bot to node (internal structure for reference)
 * Note: This is handled internally by the bot and node, dApps don't need to construct this
 */
export interface TelegramVerificationRequest {
    /** Telegram user ID from message context */
    telegram_id: string
    /** Telegram username (optional) */
    username: string
    /** User's signature of the challenge */
    signed_challenge: string
    /** Unix timestamp of attestation creation */
    timestamp: number
    /** Bot's Demos address (must be from genesis) */
    bot_address: string
    /** Bot's signature of the entire attestation */
    bot_signature: string
}