import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Native-value transfers as one-call programmatic transactions.
 *
 * Collapses the classic `pay → confirm → broadcast` flow into a single call
 * that auto-broadcasts within the configured fee ceiling.
 */
export function createPayNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Send native DEMOS tokens to an address, end to end.
         *
         * @example
         * ```ts
         * import { denomination } from "@kynesyslabs/demosdk"
         * // auto-broadcast within the 5 DEM fee cap:
         * await demos.run.pay("0x...", denomination.demToOs(100))
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.pay("0x...", 100n, { confirm: "manual" })
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param to - Receiver address (0x-prefixed hex).
         * @param amount - DEM `number` (legacy) or OS `bigint` (preferred).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        pay: (
            to: string,
            amount: number | bigint,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => ctx.demos.pay(to, amount, { nonce: opts?.nonce }), opts),

        /**
         * Alias of {@link pay}. Same dual-input amount semantics.
         *
         * @param to - Receiver address (0x-prefixed hex).
         * @param amount - DEM `number` (legacy) or OS `bigint` (preferred).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        transfer: (
            to: string,
            amount: number | bigint,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => ctx.demos.transfer(to, amount, { nonce: opts?.nonce }),
                opts,
            ),
    }
}
