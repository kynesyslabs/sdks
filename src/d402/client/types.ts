/**
 * D402 Client Types
 * Client-side types for HTTP 402 payment protocol implementation
 */

/**
 * Payment requirement from 402 response.
 *
 * P4 dual-shape: `amount` may be a JS `number` (pre-fork DEM) or a
 * decimal-`string` (post-fork OS).
 */
export interface D402PaymentRequirement {
    /** Payment amount: pre-fork `number` DEM or post-fork `string` OS. */
    amount: number | string
    /** Merchant/recipient address */
    recipient: string
    /** Resource identifier */
    resourceId: string
    /** Optional description */
    description?: string
}

/**
 * Payment settlement result
 */
export interface D402SettlementResult {
    /** Whether settlement succeeded */
    success: boolean
    /** Transaction hash (payment proof) */
    hash: string
    /** Block number (if settled) */
    blockNumber?: number
    /** Error message (if failed) */
    message?: string
}
