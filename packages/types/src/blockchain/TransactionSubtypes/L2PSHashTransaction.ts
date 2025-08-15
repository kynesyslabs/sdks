import { Transaction, TransactionContent } from "../Transaction"

/**
 * L2PS Hash Update Payload
 * 
 * Represents a consolidated hash update for an L2PS network that gets relayed to validators.
 * This payload contains aggregated information about L2PS transactions without exposing
 * the actual transaction content, preserving privacy while enabling DTR routing.
 * 
 * @example
 * ```typescript
 * const payload: L2PSHashPayload = {
 *   l2ps_uid: "l2ps_network_123",
 *   consolidated_hash: "0x1234567890abcdef...",
 *   transaction_count: 5,
 *   timestamp: 1699123456789
 * }
 * ```
 */
export interface L2PSHashPayload {
    /** The unique identifier of the L2PS network */
    l2ps_uid: string
    /** SHA-256 hash representing all L2PS transactions for this UID */
    consolidated_hash: string
    /** Number of transactions included in this hash update */
    transaction_count: number
    /** Timestamp when this hash update was generated */
    timestamp: number
}

/**
 * L2PS Hash Transaction Content
 * 
 * Transaction content specifically for L2PS hash updates that are relayed to validators.
 * These transactions are self-directed (from = to) and carry consolidated hash information.
 */
export type L2PSHashTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'l2ps_hash_update'
    data: ['l2ps_hash_update', L2PSHashPayload]
}

/**
 * L2PS Hash Update Transaction
 * 
 * Complete transaction structure for L2PS hash updates that are sent to validators
 * via DTR (Distributed Transaction Routing). These transactions enable validators
 * to track L2PS network activity without accessing the actual transaction content.
 * 
 * @example
 * ```typescript
 * const hashTransaction: L2PSHashTransaction = {
 *   content: {
 *     type: 'l2ps_hash_update',
 *     data: ['l2ps_hash_update', {
 *       l2ps_uid: "l2ps_network_123",
 *       consolidated_hash: "0x1234567890abcdef...",
 *       transaction_count: 5,
 *       timestamp: Date.now()
 *     }],
 *     from: "0x1234...",
 *     to: "0x1234...", // Self-directed transaction
 *     amount: 0,
 *     // ... other transaction fields
 *   },
 *   // ... other transaction properties
 * }
 * ```
 */
export interface L2PSHashTransaction extends Omit<Transaction, 'content'> {
    content: L2PSHashTransactionContent
}