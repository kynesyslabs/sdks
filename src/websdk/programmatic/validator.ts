import type { ValidatorNftProof } from "@/types/blockchain/TransactionSubtypes/ValidatorStakeTransaction"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/** Options for a one-call stake: the runner's options plus the seat's NFT proof. */
export type ProgrammaticStakeOptions = ProgrammaticTxOptions & {
    /**
     * NFT proof, required on the stake that creates the validator when the
     * network runs `nftValidatorGating` (then `amount` is "0").
     */
    nft?: ValidatorNftProof
}

/**
 * Validator staking lifecycle as one-call programmatic transactions.
 *
 * Collapses the classic `build → confirm → broadcast` flow for the validator
 * `stake`, `unstake` and `exit` operations into a single call that
 * auto-broadcasts within the configured fee ceiling.
 */
export function createValidatorNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Stake toward validator registration, or top up an existing stake,
         * end to end.
         *
         * @example
         * ```ts
         * import { denomination } from "@kynesyslabs/demosdk"
         * // register + auto-broadcast within the 5 DEM fee cap:
         * await demos.run.validator.stake(
         *     denomination.demToOs(1000).toString(),
         *     "https://my-validator.example",
         * )
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.validator.stake(
         *     "1000000000",
         *     "https://my-validator.example",
         *     { confirm: "manual" },
         * )
         * await demos.broadcast(r.validityData)
         * // under nftValidatorGating: a seat is backed by an NFT, not DEM
         * await demos.run.validator.stake("0", "https://my-validator.example", {
         *     nft: { mint, owner, proofTx },
         * })
         * ```
         *
         * @param amount - Stake amount as a non-negative bigint-encoded string (OS).
         * @param connectionUrl - Validator's public endpoint (required on first
         *                         stake; used to reach the node).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour,
         *               and `nft` for a seat under `nftValidatorGating`.
         */
        stake: (
            amount: string,
            connectionUrl: string,
            opts?: ProgrammaticStakeOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.tx.stake(amount, connectionUrl, ctx.demos, {
                        nonce: opts?.nonce,
                        nft: opts?.nft,
                    }),
                opts,
            ),

        /**
         * Challenge a seat whose NFT has left the wallet that proved it, end
         * to end. Only accepted under `nftValidatorGating`.
         *
         * @param validator - The challenged validator's address.
         * @param evidenceTx - Finalized Solana transfer of the NFT out of the recorded wallet.
         * @param proofTx - The proof the seat rests on (`getValidatorInfo(...).nftProofTx`).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        challenge: (
            validator: string,
            evidenceTx: string,
            proofTx: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.tx.challengeValidator(validator, evidenceTx, proofTx, ctx.demos, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Arm the unstake lock, end to end. Starts the timelock after which
         * {@link exit} becomes accepted by the network.
         *
         * @example
         * ```ts
         * await demos.run.validator.unstake()
         * ```
         *
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        unstake: (
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => ctx.demos.tx.unstake(ctx.demos, { nonce: opts?.nonce }),
                opts,
            ),

        /**
         * Complete validator exit, end to end. Only accepted by the network
         * once the unstake timelock has elapsed
         * (`unstake_available_at <= currentBlock`).
         *
         * @example
         * ```ts
         * await demos.run.validator.exit()
         * ```
         *
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        exit: (
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.tx.validatorExit(ctx.demos, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),
    }
}
