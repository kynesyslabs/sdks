/**
 * D402 Server Types
 * Server-side types for HTTP 402 payment protocol implementation
 */

/**
 * Payment requirements sent in 402 response.
 *
 * P4 dual-shape: `amount` may be a JS `number` (pre-fork DEM) or a
 * decimal-`string` (post-fork OS). SDK consumers should normalise via
 * `BigInt(...)` before arithmetic.
 */
export interface D402PaymentRequirement {
    /** Payment amount in DEM (number) or OS (decimal string). */
    amount: number | string
    /** Merchant/recipient address */
    recipient: string
    /** Resource identifier (used in memo validation) */
    resourceId: string
    /** Optional payment description */
    description?: string
}

/**
 * Payment verification result from RPC.
 *
 * P4 dual-shape: `verified_amount` may arrive as a JS `number` (pre-fork
 * DEM) or a decimal-`string` (post-fork OS).
 */
export interface D402VerificationResult {
    valid: boolean
    verified_from?: string
    verified_to?: string
    verified_amount?: number | string
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
 * Cached payment data. `amount` follows the dual-shape rule (number DEM
 * pre-fork, decimal-string OS post-fork).
 */
export interface CachedPayment {
    txHash: string
    from: string
    to: string
    amount: number | string
    memo: string
    timestamp: number
    expiresAt: number
}
