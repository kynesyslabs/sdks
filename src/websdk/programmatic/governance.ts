import type { NetworkParameters } from "@/types/blockchain/NetworkParameters"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Parameters for a network-upgrade proposal.
 *
 * Mirrors the object accepted by `DemosTransactions.proposeNetworkUpgrade`.
 */
export interface ProposeNetworkUpgradeParams {
    /** UUID. Also used as lexicographic activation-order tiebreaker. */
    proposalId: string
    /** Subset of {@link NetworkParameters} to change. */
    proposedParameters: Partial<NetworkParameters>
    /** Human-readable reason, ≤1024 bytes. */
    rationale: string
    /** Activation block. Must be ≥ tallyBlock + grace period. */
    effectiveAtBlock: number
}

/**
 * On-chain governance (network upgrades) as one-call programmatic transactions.
 *
 * Collapses the classic `build → confirm → broadcast` flow for proposing and
 * voting on network upgrades into a single call that auto-broadcasts within
 * the configured fee ceiling.
 */
export function createGovernanceNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Submit a network-upgrade proposal, end to end.
         *
         * @example
         * ```ts
         * await demos.run.governance.propose({
         *     proposalId: crypto.randomUUID(),
         *     proposedParameters: { blockTimeMs: 5000 },
         *     rationale: "Reduce block time for lower latency.",
         *     effectiveAtBlock: 1_000_000,
         * })
         * ```
         *
         * @param params - Proposal fields (id, parameters, rationale, activation block).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        propose: (
            params: ProposeNetworkUpgradeParams,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.tx.proposeNetworkUpgrade(params, ctx.demos, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Cast a vote on a pending network-upgrade proposal, end to end. The
         * vote is final and non-revocable.
         *
         * @example
         * ```ts
         * await demos.run.governance.vote(proposalId, true) // yes
         * await demos.run.governance.vote(proposalId, false) // no
         * ```
         *
         * @param proposalId - The proposal to vote on.
         * @param approve - `true` to approve, `false` to reject.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        vote: (
            proposalId: string,
            approve: boolean,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.tx.voteOnUpgrade(proposalId, approve, ctx.demos, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),
    }
}
