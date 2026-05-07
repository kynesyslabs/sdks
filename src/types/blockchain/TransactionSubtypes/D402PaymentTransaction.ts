import { Transaction, TransactionContent } from "../Transaction"

/**
 * D402 Payment Payload
 * Represents a gasless payment transaction in the D402 protocol.
 *
 * Wire-format compatibility (P4): `amount` may be either a JS `number`
 * (pre-fork DEM, legacy) or a decimal `string` in OS (post-fork). The
 * SDK's serializerGate normalises at the wire boundary based on the
 * connected node's fork status.
 */
export interface D402PaymentPayload {
    /** Recipient's Demos address */
    to: string
    /** Payment amount: pre-fork `number` (DEM) or post-fork `string` (OS). */
    amount: number | string
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
