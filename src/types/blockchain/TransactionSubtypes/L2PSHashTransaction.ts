import { Transaction, TransactionContent } from "../Transaction"

/**
 * L2PS Hash Update Payload
 * 
 * Contains consolidated hash information for a specific L2PS network.
 * This payload is used to relay L2PS transaction state to validators
 * via the DTR (Distributed Transaction Routing) system without exposing
 * the actual encrypted transaction content.
 * 
 * @interface L2PSHashPayload
 */
export interface L2PSHashPayload {
    /** 
     * L2PS network identifier
     * @example "network_1", "private_subnet_alpha"
     */
    l2ps_uid: string

    /** 
     * SHA256 hash representing all L2PS transactions for this UID
     * This hash is deterministic and includes transaction count + sorted hashes
     * @example "0xa1b2c3d4e5f6789..."
     */
    consolidated_hash: string

    /** 
     * Number of transactions included in the consolidated hash
     * Used for validation and state verification
     */
    transaction_count: number

    /** 
     * Unix timestamp in milliseconds when hash was generated
     * Used for temporal ordering and validation
     */
    timestamp: number
}

/**
 * L2PS Hash Update Transaction Content
 * 
 * Specialized transaction content for L2PS hash updates that are relayed
 * to validators via DTR. These transactions contain consolidated hash
 * information representing the state of an L2PS network without exposing
 * individual transaction details.
 */
export type L2PSHashTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    /** Transaction type identifier for L2PS hash updates */
    type: 'l2ps_hash_update'
    
    /** 
     * Transaction data tuple containing type and payload
     * Follows DEMOS transaction data pattern: [type, payload]
     */
    data: ['l2ps_hash_update', L2PSHashPayload]
}

/**
 * L2PS Hash Update Transaction
 * 
 * Complete transaction structure for L2PS hash updates. These transactions
 * are created by L2PS participating nodes every 5 seconds and automatically
 * relayed to validators via the DTR system.
 * 
 * Key Characteristics:
 * - Self-directed (from = to) but routed via DTR
 * - Zero token transfer (amount = 0)
 * - Contains consolidated L2PS network state hash
 * - Preserves L2PS privacy (no individual transaction exposure)
 * - Enables validator consensus on L2PS state
 * 
 * @interface L2PSHashTransaction
 * @extends Transaction
 */
export interface L2PSHashTransaction extends Omit<Transaction, 'content'> {
    /** L2PS hash update transaction content */
    content: L2PSHashTransactionContent
}