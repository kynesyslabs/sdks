import { Transaction, TransactionContent } from "../Transaction"
import { INativePayload } from "../../native"

export type NativeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'native'
    data: ['native', INativePayload]
}

export interface NativeTransaction extends Omit<Transaction, 'content'> {
    content: NativeTransactionContent
} 