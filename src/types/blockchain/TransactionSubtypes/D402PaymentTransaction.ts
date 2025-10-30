import { Transaction, TransactionContent } from "../Transaction"

/**
 * D402 Payment Payload
 * Represents a gasless payment transaction in the D402 protocol
 */
export interface D402PaymentPayload {
    /** Recipient's Demos address */
    to: string
    /** Payment amount in smallest unit */
    amount: number
    /** Optional memo/description for the payment */
    memo?: string
}

export type D402PaymentTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'd402_payment'
    data: ['d402_payment', D402PaymentPayload]
}

export interface D402PaymentTransaction extends Omit<Transaction, 'content'> {
    content: D402PaymentTransactionContent
}
