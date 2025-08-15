import { Transaction, TransactionContent } from "../Transaction"
import { L2PSEncryptedPayload } from "@kynesyslabs/l2ps"

export type L2PSTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'l2psEncryptedTx'
    data: ['l2psEncryptedTx', L2PSEncryptedPayload]
}

export interface L2PSTransaction extends Omit<Transaction, 'content'> {
    content: L2PSTransactionContent
} 