import type { TokenCreationParams } from "@/types/token"
import { DemosTokens } from "../DemosTokens"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Token creation and execution as one-call programmatic transactions.
 *
 * Wraps {@link DemosTokens} so deploying a token or running a token
 * operation (transfer, approve, mint, burn, …) collapses the classic
 * `build → sign → confirm → broadcast` flow into a single call. Each
 * builder here returns an UNSIGNED transaction; the method hands a thunk
 * producing it to `ctx.run(...)`, which signs, confirms against the fee
 * ceiling and auto-broadcasts — keeping fee-cap policy, confirmation
 * strategy and result shape uniform with the rest of `demos.run.*`.
 *
 * All amounts are bigint-valued decimal strings, mirroring
 * {@link DemosTokens}.
 */
export function createTokensNamespace(ctx: ProgrammaticContext) {
    const tokens = new DemosTokens(ctx.demos)

    return {
        /**
         * Deploy a new token, end to end.
         *
         * @example
         * ```ts
         * const r = await demos.run.tokens.create({
         *     name: "My Token",
         *     ticker: "MYT",
         *     decimals: 18,
         *     initialSupply: "1000000",
         * })
         * console.log(r.transaction.content.to) // derived token address
         * ```
         *
         * @param params - Token creation parameters (name, ticker, decimals,
         *                  initial supply, optional script/ACL).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        create: (
            params: TokenCreationParams,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => tokens.createToken(params), opts),

        /**
         * Transfer tokens to another address, end to end.
         *
         * @example
         * ```ts
         * // auto-broadcast within the 5 DEM fee cap:
         * await demos.run.tokens.transfer("0xToken...", "0xTo...", "1000")
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.tokens.transfer(
         *     "0xToken...", "0xTo...", "1000", { confirm: "manual" },
         * )
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param tokenAddress - Token contract address.
         * @param to - Recipient address.
         * @param amount - Amount to transfer (bigint-valued decimal string).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        transfer: (
            tokenAddress: string,
            to: string,
            amount: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => tokens.transfer(tokenAddress, to, amount), opts),

        /**
         * Approve a spender to move tokens on your behalf, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param spender - Spender address being granted the allowance.
         * @param amount - Amount to approve (bigint-valued decimal string).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        approve: (
            tokenAddress: string,
            spender: string,
            amount: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => tokens.approve(tokenAddress, spender, amount), opts),

        /**
         * Mint new tokens to an address, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param to - Recipient of the minted tokens.
         * @param amount - Amount to mint (bigint-valued decimal string).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        mint: (
            tokenAddress: string,
            to: string,
            amount: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => tokens.mint(tokenAddress, to, amount), opts),

        /**
         * Burn tokens from an address, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param from - Address to burn tokens from.
         * @param amount - Amount to burn (bigint-valued decimal string).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        burn: (
            tokenAddress: string,
            from: string,
            amount: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => tokens.burn(tokenAddress, from, amount), opts),
    }
}
