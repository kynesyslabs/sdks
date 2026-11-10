import { Transaction, TransactionContent } from "../Transaction"

/**
 * Proof that a Solana wallet holding an eligible node NFT consents to
 * backing this validator. `proofTx` is the signature of a finalized Solana
 * transaction signed by `owner` that self-transfers `mint` and carries the
 * memo `demos-validator:<validator address>`.
 */
export interface ValidatorNftProof {
    /** Base58 mint address of the node NFT. */
    mint: string
    /** Base58 wallet address holding the NFT and signing the proof. */
    owner: string
    /** Base58 signature of the proof transaction. */
    proofTx: string
}

/** Payload for a `validatorStake` tx. */
export interface ValidatorStakePayload {
    /** Stake amount as bigint-encoded string. */
    amount: string
    /** Validator's public-facing connection URL (used on first stake only). */
    connectionUrl: string
    /** Required when the stake creates the validator; omitted on top-ups. */
    nft?: ValidatorNftProof
}

export type ValidatorStakeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'validatorStake'
    data: ['validatorStake', ValidatorStakePayload]
}

export interface ValidatorStakeTransaction extends Omit<Transaction, 'content'> {
    content: ValidatorStakeTransactionContent
}
