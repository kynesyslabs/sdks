import { Transaction } from "../Transaction"
import { SpecificTransaction } from "./index"

/**
 * Type guard to check if a transaction is of a specific type
 * @param tx The transaction to check
 * @param type The expected transaction type
 * @returns True if the transaction is of the specified type
 * 
 * @example
 * ```typescript
 * const tx: Transaction = { ... }
 * if (isTransactionType(tx, 'l2psEncryptedTx')) {
 *     // tx is now typed as L2PSTransaction
 *     const [_, payload] = tx.content.data
 *     // payload is typed as L2PSEncryptedPayload
 * }
 * ```
 */
export function isTransactionType<T extends SpecificTransaction>(
    tx: Transaction,
    type: T['content']['type']
): tx is T {
    return tx.content.type === type
}

/**
 * Type guard to check if a transaction's data matches the expected type
 * @param tx The transaction to check
 * @param dataType The expected data type
 * @returns True if the transaction's data is of the specified type
 * 
 * @example
 * ```typescript
 * const tx: Transaction = { ... }
 * if (isTransactionDataType(tx, 'l2psEncryptedTx')) {
 *     // tx.content.data[0] is 'l2psEncryptedTx'
 *     // tx.content.data[1] is L2PSEncryptedPayload
 * }
 * ```
 */
export function isTransactionDataType<T extends SpecificTransaction['content']['data'][0]>(
    tx: Transaction,
    dataType: T
): tx is Transaction & { content: { data: [T, any] } } {
    return tx.content.data[0] === dataType
}
