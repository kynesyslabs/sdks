import { Transaction, TransactionContent } from "../Transaction"

export interface EscrowPayload {
    platform: string
    username: string
    amount?: string
    operation?: string
}

export type EscrowTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'escrow'
    data: ["escrow", EscrowPayload]
}

export interface EscrowTransaction extends Omit<Transaction, 'content'> {
    content: EscrowTransactionContent
}
