import { Transaction, TransactionContent } from "../Transaction"

/**
 * Payload for a `validatorChallenge` tx. Anyone may submit one: it evicts
 * `validator` when `evidenceTx` is a finalized Solana transaction that moved
 * the validator's NFT out of the wallet recorded at stake time.
 */
export interface ValidatorChallengePayload {
    /** Address of the validator whose seat is challenged. */
    validator: string
    /** Base58 signature of the Solana transfer that moved the NFT. */
    evidenceTx: string
}

export type ValidatorChallengeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'validatorChallenge'
    data: ['validatorChallenge', ValidatorChallengePayload]
}

export interface ValidatorChallengeTransaction extends Omit<Transaction, 'content'> {
    content: ValidatorChallengeTransactionContent
}
