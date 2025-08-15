import { Transaction, TransactionContent } from "../Transaction"
import { IdentityPayload } from "../../abstraction"

export type IdentityTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'identity'
    data: ['identity', IdentityPayload]
}

export interface IdentityTransaction extends Omit<Transaction, 'content'> {
    content: IdentityTransactionContent
} 