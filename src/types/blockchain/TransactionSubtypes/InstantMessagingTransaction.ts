import { Transaction, TransactionContent } from "../Transaction"
import { InstantMessagingPayload } from "@/types/instantMessaging"

export type InstantMessagingTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'instantMessaging'
    data: ['instantMessaging', InstantMessagingPayload]
}

export interface InstantMessagingTransaction extends Omit<Transaction, 'content'> {
    content: InstantMessagingTransactionContent
} 