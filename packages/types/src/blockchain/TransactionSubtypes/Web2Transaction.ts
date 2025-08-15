import { Transaction, TransactionContent } from "../Transaction"
import { IWeb2Payload } from "../../web2"

export type Web2TransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'web2Request'
    data: ['web2Request', IWeb2Payload]
}

export interface Web2Transaction extends Omit<Transaction, 'content'> {
    content: Web2TransactionContent
} 