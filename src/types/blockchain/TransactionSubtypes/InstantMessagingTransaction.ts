import { Transaction, TransactionContent } from "../Transaction"
import { InstantMessagingPayload, L2PSInstantMessagingPayload } from "@/types/instantMessaging"

export type InstantMessagingTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'instantMessaging'
    data: ['instantMessaging', InstantMessagingPayload]
}

export interface InstantMessagingTransaction extends Omit<Transaction, 'content'> {
    content: InstantMessagingTransactionContent
}

/** L2PS-backed instant messaging transaction */
export type L2PSInstantMessagingTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'instantMessaging'
    data: ['instantMessaging', L2PSInstantMessagingPayload]
}

export interface L2PSInstantMessagingTransaction extends Omit<Transaction, 'content'> {
    content: L2PSInstantMessagingTransactionContent
}