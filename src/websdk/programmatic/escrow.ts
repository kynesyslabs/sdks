import { EscrowTransaction } from "@/escrow"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Social-identity escrow as one-call programmatic transactions.
 *
 * Wraps the static {@link EscrowTransaction} builders so sending DEM to an
 * unclaimed social identity, claiming it, or refunding an expired escrow
 * collapses the classic `build/sign → confirm → broadcast` flow into a
 * single call. Each builder here returns a SIGNED transaction; the method
 * hands a thunk producing it to `ctx.run(...)`, which confirms against the
 * fee ceiling and auto-broadcasts — keeping fee-cap policy, confirmation
 * strategy and result shape uniform with the rest of `demos.run.*`.
 */
export function createEscrowNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Send DEM to a social-identity escrow, end to end.
         *
         * P4 dual-input amount: `bigint` OS (preferred) or `number` DEM
         * (legacy, auto-converted). Sub-DEM precision against a pre-fork
         * node throws.
         *
         * @example
         * ```ts
         * import { denomination } from "@kynesyslabs/demosdk"
         * // auto-broadcast within the 5 DEM fee cap:
         * await demos.run.escrow.send(
         *     "twitter", "@bob", denomination.demToOs(100),
         *     { expiryDays: 30, message: "Welcome to Demos!" },
         * )
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.escrow.send(
         *     "twitter", "@bob", 100n, undefined, { confirm: "manual" },
         * )
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param platform - Social platform ("twitter", "github", "telegram").
         * @param username - Username on that platform (e.g., "@bob").
         * @param amount - DEM `number` (legacy) or OS `bigint` (preferred).
         * @param options - Optional escrow parameters (expiry, memo).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        send: (
            platform: "twitter" | "github" | "telegram",
            username: string,
            amount: number | bigint,
            options?: {
                expiryDays?: number
                message?: string
            },
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    EscrowTransaction.sendToIdentity(
                        ctx.demos,
                        platform,
                        username,
                        amount,
                        options,
                    ),
                opts,
            ),

        /**
         * Claim escrowed funds for a social identity you have linked, end to
         * end.
         *
         * @example
         * ```ts
         * await demos.run.escrow.claim("twitter", "@bob")
         * ```
         *
         * @param platform - Social platform ("twitter", "github", "telegram").
         * @param username - Username to claim for.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        claim: (
            platform: "twitter" | "github" | "telegram",
            username: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    EscrowTransaction.claimEscrow(
                        ctx.demos,
                        platform,
                        username,
                    ),
                opts,
            ),

        /**
         * Refund an expired escrow back to the original depositor, end to
         * end.
         *
         * @example
         * ```ts
         * await demos.run.escrow.refund("twitter", "@unclaimed_user")
         * ```
         *
         * @param platform - Social platform ("twitter", "github", "telegram").
         * @param username - Username whose expired escrow to refund.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        refund: (
            platform: "twitter" | "github" | "telegram",
            username: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    EscrowTransaction.refundExpiredEscrow(
                        ctx.demos,
                        platform,
                        username,
                    ),
                opts,
            ),
    }
}
