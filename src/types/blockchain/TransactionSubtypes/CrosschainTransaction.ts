import { Transaction, TransactionContent } from "../Transaction"
import { XMScript } from "@/types/xm"

export type CrosschainTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'crosschainOperation'
    data: ['crosschainOperation', XMScript]
}

export interface CrosschainTransaction extends Omit<Transaction, 'content'> {
    content: CrosschainTransactionContent
} 