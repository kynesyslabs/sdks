import type {
    TokenCreationParams,
    TokenHookType,
    TokenScriptMethod,
} from "@/types/token"
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
            ctx.run(
                () => tokens.createToken(params, { nonce: opts?.nonce }),
                opts,
            ),

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
            ctx.run(
                () =>
                    tokens.transfer(tokenAddress, to, amount, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

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
            ctx.run(
                () =>
                    tokens.approve(tokenAddress, spender, amount, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

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
            ctx.run(
                () =>
                    tokens.mint(tokenAddress, to, amount, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

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
            ctx.run(
                () =>
                    tokens.burn(tokenAddress, from, amount, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Transfer tokens from one address to another using an existing
         * allowance, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param from - Owner address the tokens are moved from.
         * @param to - Recipient address.
         * @param amount - Amount to transfer (bigint-valued decimal string).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        transferFrom: (
            tokenAddress: string,
            from: string,
            to: string,
            amount: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    tokens.transferFrom(tokenAddress, from, to, amount, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Pause all token operations, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        pause: (
            tokenAddress: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => tokens.pause(tokenAddress, { nonce: opts?.nonce }),
                opts,
            ),

        /**
         * Resume a paused token, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        unpause: (
            tokenAddress: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => tokens.unpause(tokenAddress, { nonce: opts?.nonce }),
                opts,
            ),

        /**
         * Transfer ownership of the token to a new owner, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param newOwner - Address of the new owner.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        transferOwnership: (
            tokenAddress: string,
            newOwner: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    tokens.transferOwnership(tokenAddress, newOwner, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),

        /**
         * Grant ACL permissions to an address, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param address - Address being granted the permissions.
         * @param permissions - Permissions to grant.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        grantPermissions: (
            tokenAddress: string,
            address: string,
            permissions: string[],
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    tokens.grantPermissions(
                        tokenAddress,
                        address,
                        permissions,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Revoke ACL permissions from an address, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param address - Address the permissions are revoked from.
         * @param permissions - Permissions to revoke.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        revokePermissions: (
            tokenAddress: string,
            address: string,
            permissions: string[],
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    tokens.revokePermissions(
                        tokenAddress,
                        address,
                        permissions,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Upgrade the token's on-chain script, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param newCode - New script code.
         * @param newMethods - New method definitions to install.
         * @param newHooks - New hooks to activate.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        upgradeScript: (
            tokenAddress: string,
            newCode: string,
            newMethods: TokenScriptMethod[],
            newHooks: TokenHookType[],
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    tokens.upgradeScript(
                        tokenAddress,
                        newCode,
                        newMethods,
                        newHooks,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),

        /**
         * Call a custom script method on the token, end to end.
         *
         * @param tokenAddress - Token contract address.
         * @param method - Method name to invoke.
         * @param params - Method parameters.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        callMethod: (
            tokenAddress: string,
            method: string,
            params: unknown[],
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => tokens.callMethod(tokenAddress, method, params, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),
    }
}
