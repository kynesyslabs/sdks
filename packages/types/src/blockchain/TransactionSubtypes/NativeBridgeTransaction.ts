import { Transaction, TransactionContent } from "../Transaction"

export type NativeBridgeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'nativeBridge'
    data: ['nativeBridge', any]
}

export interface NativeBridgeTransaction extends Omit<Transaction, 'content'> {
    content: NativeBridgeTransactionContent
} 