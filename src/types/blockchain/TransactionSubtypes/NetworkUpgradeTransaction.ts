import { Transaction, TransactionContent } from "../Transaction"
import type { NetworkParameters } from "../NetworkParameters"

/** Payload for a `networkUpgrade` proposal tx. */
export interface NetworkUpgradePayload {
    /** UUID chosen by the proposer — used as dedup key and activation-order tiebreaker. */
    proposalId: string
    /** Only the keys the proposer wants to change. */
    proposedParameters: Partial<NetworkParameters>
    /** Human-readable reason. <= 1024 bytes. */
    rationale: string
    /** Block at which approved upgrades activate. Must respect the grace period. */
    effectiveAtBlock: number
}

export type NetworkUpgradeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'networkUpgrade'
    data: ['networkUpgrade', NetworkUpgradePayload]
}

export interface NetworkUpgradeTransaction extends Omit<Transaction, 'content'> {
    content: NetworkUpgradeTransactionContent
}
