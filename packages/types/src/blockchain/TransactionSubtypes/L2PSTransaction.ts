import { Transaction, TransactionContent } from "../Transaction"

export type L2PSTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'l2psEncryptedTx'
    data: ['l2psEncryptedTx', any]
}

export interface L2PSTransaction extends Omit<Transaction, 'content'> {
    content: L2PSTransactionContent
} 