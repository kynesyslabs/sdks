import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

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
         * ```
         *
         * @param amount - Stake amount as a non-negative bigint-encoded string (OS).
         * @param connectionUrl - Validator's public endpoint (required on first
         *                         stake; used to reach the node).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        stake: (
            amount: string,
            connectionUrl: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => ctx.demos.tx.stake(amount, connectionUrl, ctx.demos),
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
            ctx.run(() => ctx.demos.tx.unstake(ctx.demos), opts),

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
            ctx.run(() => ctx.demos.tx.validatorExit(ctx.demos), opts),
    }
}
