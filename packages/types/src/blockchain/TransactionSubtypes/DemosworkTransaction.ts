import { Transaction, TransactionContent } from "../Transaction"

export type DemosworkTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'demoswork'
    data: ['demoswork', any]
}

export interface DemosworkTransaction extends Omit<Transaction, 'content'> {
    content: DemosworkTransactionContent
} 