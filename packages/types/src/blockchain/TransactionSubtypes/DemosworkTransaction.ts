import { Transaction, TransactionContent } from "../Transaction"
import { DemoScript } from "../../demoswork"

export type DemosworkTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'demoswork'
    data: ['demoswork', DemoScript]
}

export interface DemosworkTransaction extends Omit<Transaction, 'content'> {
    content: DemosworkTransactionContent
} 