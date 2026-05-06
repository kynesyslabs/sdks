import { Transaction, TransactionContent } from "../Transaction"

/** Payload for a `validatorExit` tx. Sender is implicit in the tx envelope. */
export type ValidatorExitPayload = Record<string, never>

export type ValidatorExitTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'validatorExit'
    data: ['validatorExit', ValidatorExitPayload]
}

export interface ValidatorExitTransaction extends Omit<Transaction, 'content'> {
    content: ValidatorExitTransactionContent
}
