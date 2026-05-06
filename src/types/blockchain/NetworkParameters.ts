// Stackable-genesis governance types. Canonical spec:
// planning/adversarial_review/stackable_genesis_system_v2.md in the node repo.
//
// These types are the payload shape for governance transactions + the return
// shape of governance-query RPCs. They intentionally do not include
// implementation-level DB columns; the node entities may carry additional
// fields (createdAt, tally_block, etc.).

/** Tunable network parameters — the actual config values at runtime. */
export interface NetworkParameters {
    /** Target block time in ms. (Phase 2 — consensus-affecting) */
    blockTimeMs: number
    /** Default shard size for consensus. (Phase 2 — consensus-affecting) */
    shardSize: number
    /** Minimum DEMOS to become a validator. bigint-as-string. */
    minValidatorStake: string
    /** Default network fee, basis points [0, 5000]. */
    networkFee: number
    /** Default RPC fee, basis points [0, 5000]. */
    rpcFee: number
    /** Feature flags — string key → boolean. */
    featureFlags: Record<string, boolean>
}

export type NetworkParameterKey = keyof NetworkParameters

export type ProposalStatus =
    | "pending"
    | "approved"
    | "activating"
    | "active"
    | "rejected"

/** A proposal to change a subset of NetworkParameters. */
export interface NetworkUpgradeProposal {
    /** Monotonic, human-readable label. Assigned at proposal time as max(existing) + 1. */
    version: number
    /** UUID. Dedup key AND lexicographic activation-order tiebreaker. */
    proposalId: string
    /** Proposer's public key (hex). Must be an active validator at snapshotBlock. */
    proposerPublicKey: string
    /** Only the keys the proposer wants to change. */
    proposedParameters: Partial<NetworkParameters>
    /** Activation block. Must be >= tallyBlock + gracePeriodBlocks. */
    effectiveAtBlock: number
    /** Human-readable reason. <= 1024 bytes. */
    rationale: string
    status: ProposalStatus
    /** Block at which the proposal tx was confirmed. Freezes validator set + stakes. */
    snapshotBlock: number
}

/** Per-proposal vote-tally summary. */
export interface ProposalVoteInfo {
    proposalId: string
    /** Total staked weight of ALL snapshot validators (bigint-as-string). */
    totalStakedWeight: string
    /** Staked weight of voters who approved (bigint-as-string). */
    approveWeight: string
    /** Staked weight of voters who rejected (bigint-as-string). */
    rejectWeight: string
    votes: Array<{ voter: string; approve: boolean; weight: string }>
    /** 2/3 of totalStakedWeight (bigint-as-string). */
    threshold: string
    /** True iff approveWeight >= threshold. */
    passed: boolean
}
