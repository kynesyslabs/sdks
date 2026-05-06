import { Transaction, TransactionContent } from "../Transaction"

/** Payload for a `validatorStake` tx. */
export interface ValidatorStakePayload {
    /** Stake amount as bigint-encoded string. */
    amount: string
    /** Validator's public-facing connection URL (used on first stake only). */
    connectionUrl: string
}

export type ValidatorStakeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'validatorStake'
    data: ['validatorStake', ValidatorStakePayload]
}

export interface ValidatorStakeTransaction extends Omit<Transaction, 'content'> {
    content: ValidatorStakeTransactionContent
}
