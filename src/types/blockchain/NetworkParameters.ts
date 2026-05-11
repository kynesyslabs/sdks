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
    /**
     * Default additional fee — reserved for the future dApp-paid fee
     * path described in DEM-665. Today every chain ships with
     * `additionalFee: 0`. Basis-points bounds match the other fee
     * scalars: [0, 5000].
     */
    additionalFee: number
    /**
     * Per-component fee distribution percentages. DEM-665 splits the
     * single lump-sum gas deduction into network / rpc / additional fee
     * components, each routed across burn / treasury / rpc-operator
     * recipients per these tunable percentages.
     *
     * Cross-key invariant enforced by `safetyBounds.ts`: within each
     * group the percentages MUST sum to exactly 100.
     *
     *   network_fee:    burnPct + treasuryPct                === 100
     *   additional_fee: burnPct + treasuryPct                === 100
     *   special_ops:    burnPct + treasuryPct + rpcPct       === 100
     *
     * `rpc_fee` itself is implicit 100% to the rpc operator — no
     * tunables here, no entry on this struct. Proposals touching any
     * distribution key are governed by a tighter ±10% per-proposal cap
     * (vs the default ±50%) so a single bad actor cannot drain the
     * treasury in one vote.
     */
    networkFeeBurnPct: number
    networkFeeTreasuryPct: number
    additionalFeeBurnPct: number
    additionalFeeTreasuryPct: number
    specialOpsBurnPct: number
    specialOpsTreasuryPct: number
    specialOpsRpcPct: number
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
