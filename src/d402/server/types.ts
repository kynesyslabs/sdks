/**
 * D402 Server Types
 * Server-side types for HTTP 402 payment protocol implementation
 */

/**
 * Payment requirements sent in 402 response
 */
export interface D402PaymentRequirement {
    /** Payment amount in smallest unit */
    amount: number
    /** Merchant/recipient address */
    recipient: string
    /** Resource identifier (used in memo validation) */
    resourceId: string
    /** Optional payment description */
    description?: string
}

/**
 * Payment verification result from RPC
 */
export interface D402VerificationResult {
    valid: boolean
    verified_from?: string
    verified_to?: string
    verified_amount?: number
    verified_memo?: string
    timestamp: number
}

/**
 * D402Server configuration options
 */
export interface D402ServerConfig {
    /** Demos Network RPC URL */
    rpcUrl: string
    /** Payment cache TTL in seconds (default: 300 = 5 minutes) */
    cacheTTL?: number
}

/**
 * Cached payment data
 */
export interface CachedPayment {
    txHash: string
    from: string
    to: string
    amount: number
    memo: string
    timestamp: number
    expiresAt: number
}
