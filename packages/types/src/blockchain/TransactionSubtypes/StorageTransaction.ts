import { Transaction, TransactionContent } from "../Transaction"

/**
 * Storage payload containing binary data for storage transactions.
 * The bytes are base64-encoded for JSONB compatibility in the node repository.
 */
export interface StoragePayload {
    /** Base64-encoded binary data to be stored */
    bytes: string
    /** Optional metadata associated with the storage */
    metadata?: Record<string, any>
}

/**
 * Transaction content type for storage operations.
 * Extends the base TransactionContent with storage-specific type and data.
 */
export type StorageTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'storage'
    data: ['storage', StoragePayload]
}

/**
 * Complete storage transaction interface.
 * Used for storing binary data on the blockchain with JSONB compatibility.
 */
export interface StorageTransaction extends Omit<Transaction, 'content'> {
    content: StorageTransactionContent
}