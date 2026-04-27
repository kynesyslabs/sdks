import { Transaction, TransactionContent } from "../Transaction"

/** Payload for a `validatorUnstake` tx. Sender is implicit in the tx envelope. */
export type ValidatorUnstakePayload = Record<string, never>

export type ValidatorUnstakeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'validatorUnstake'
    data: ['validatorUnstake', ValidatorUnstakePayload]
}

export interface ValidatorUnstakeTransaction extends Omit<Transaction, 'content'> {
    content: ValidatorUnstakeTransactionContent
}
