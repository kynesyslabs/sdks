import { Transaction, TransactionContent } from "../Transaction"

/** Payload for a `networkUpgradeVote` tx. One vote per validator per proposal; final. */
export interface NetworkUpgradeVotePayload {
    proposalId: string
    approve: boolean
}

export type NetworkUpgradeVoteTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'networkUpgradeVote'
    data: ['networkUpgradeVote', NetworkUpgradeVotePayload]
}

export interface NetworkUpgradeVoteTransaction extends Omit<Transaction, 'content'> {
    content: NetworkUpgradeVoteTransactionContent
}
