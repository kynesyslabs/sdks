/**
 * DemosTokens - SDK Utility Class for Token Operations
 *
 * Provides methods to create, execute, and query tokens on the Demos Network.
 * Works with the Demos class for signing and broadcasting transactions.
 */

import type { Demos } from "./demosclass"
import type { Transaction } from "@/types"
import type {
    TokenCreationParams,
    TokenQueryResult,
    TokenBalanceResult,
    TokenHookType,
    TokenScriptMethod,
} from "@/types/token"
import {
    deriveTokenAddress,
    validateTokenCreationParams,
} from "@/types/token"
import type {
    TokenCreationPayload,
    TokenExecutionPayload,
    TokenOperationType,
    TokenTransferArgs,
    TokenApproveArgs,
    TokenTransferFromArgs,
    TokenMintArgs,
    TokenBurnArgs,
    TokenACLArgs,
    TokenUpgradeArgs,
    TokenCustomArgs,
} from "@/types/blockchain/TransactionSubtypes/TokenTransaction"

/**
 * Utility class for token operations on Demos Network.
 */
export class DemosTokens {
    private demos: Demos

    constructor(demos: Demos) {
        this.demos = demos
    }

    // SECTION: Token Creation

    /**
     * Creates a token creation transaction.
     *
     * @param params - Token creation parameters
     * @returns Unsigned transaction ready for signing
     */
    async createToken(params: TokenCreationParams): Promise<Transaction> {
        // Validate parameters
        const validation = validateTokenCreationParams(params)
        if (!validation.valid) {
            throw new Error(`Invalid token parameters: ${validation.errors.join(", ")}`)
        }

        const payload: TokenCreationPayload = {
            name: params.name,
            ticker: params.ticker,
            decimals: params.decimals,
            initialSupply: params.initialSupply,
            script: params.script,
            initialACL: params.initialACL?.map((entry) => ({
                address: entry.address,
                permissions: entry.permissions,
            })),
        }

        // Get deployer info for address derivation preview
        const deployerAddress = this.demos.getAddress()
        const nonce = await this.demos.getAddressNonce(deployerAddress)

        // Derive the token address (preview - actual derivation happens on-chain)
        const tokenAddress = deriveTokenAddress(deployerAddress, nonce, params)

        const tx: Transaction = {
            content: {
                type: "tokenCreation",
                data: ["tokenCreation", payload],
                from: deployerAddress,
                from_ed25519_address: await this.demos.getEd25519Address(),
                to: tokenAddress, // Token's own address
                amount: 0,
                timestamp: 0, // Will be set during signing
                nonce: nonce,
                transaction_fee: {
                    network_fee: 0,
                    rpc_fee: 0,
                    additional_fee: 0,
                },
                gcr_edits: [],
            },
            hash: "",
            signature: { type: "ed25519", data: "" },
            ed25519_signature: "",
            status: "pending",
            blockNumber: null,
        }

        return tx
    }

    /**
     * Creates and signs a token creation transaction.
     *
     * @param params - Token creation parameters
     * @returns Signed transaction ready for confirm/broadcast
     */
    async createTokenSigned(params: TokenCreationParams): Promise<Transaction> {
        const tx = await this.createToken(params)
        return this.demos.sign(tx)
    }

    // SECTION: Token Operations

    /**
     * Creates a transfer transaction.
     *
     * @param tokenAddress - Token contract address
     * @param to - Recipient address
     * @param amount - Amount to transfer (as string for bigint)
     * @returns Unsigned transaction
     */
    async transfer(tokenAddress: string, to: string, amount: string): Promise<Transaction> {
        const args: TokenTransferArgs = { type: "transfer", to, amount }
        return this._createExecutionTx(tokenAddress, "transfer", args)
    }

    /**
     * Creates an approve transaction.
     *
     * @param tokenAddress - Token contract address
     * @param spender - Spender address
     * @param amount - Amount to approve (as string for bigint)
     * @returns Unsigned transaction
     */
    async approve(tokenAddress: string, spender: string, amount: string): Promise<Transaction> {
        const args: TokenApproveArgs = { type: "approve", spender, amount }
        return this._createExecutionTx(tokenAddress, "approve", args)
    }

    /**
     * Creates a transferFrom transaction.
     *
     * @param tokenAddress - Token contract address
     * @param from - Owner address
     * @param to - Recipient address
     * @param amount - Amount to transfer (as string for bigint)
     * @returns Unsigned transaction
     */
    async transferFrom(
        tokenAddress: string,
        from: string,
        to: string,
        amount: string
    ): Promise<Transaction> {
        const args: TokenTransferFromArgs = { type: "transferFrom", from, to, amount }
        return this._createExecutionTx(tokenAddress, "transferFrom", args)
    }

    /**
     * Creates a mint transaction.
     *
     * @param tokenAddress - Token contract address
     * @param to - Recipient address
     * @param amount - Amount to mint (as string for bigint)
     * @returns Unsigned transaction
     */
    async mint(tokenAddress: string, to: string, amount: string): Promise<Transaction> {
        const args: TokenMintArgs = { type: "mint", to, amount }
        return this._createExecutionTx(tokenAddress, "mint", args)
    }

    /**
     * Creates a burn transaction.
     *
     * @param tokenAddress - Token contract address
     * @param from - Address to burn from
     * @param amount - Amount to burn (as string for bigint)
     * @returns Unsigned transaction
     */
    async burn(tokenAddress: string, from: string, amount: string): Promise<Transaction> {
        const args: TokenBurnArgs = { type: "burn", from, amount }
        return this._createExecutionTx(tokenAddress, "burn", args)
    }

    /**
     * Creates a pause transaction.
     *
     * @param tokenAddress - Token contract address
     * @returns Unsigned transaction
     */
    async pause(tokenAddress: string): Promise<Transaction> {
        return this._createExecutionTx(tokenAddress, "pause", { type: "pause" })
    }

    /**
     * Creates an unpause transaction.
     *
     * @param tokenAddress - Token contract address
     * @returns Unsigned transaction
     */
    async unpause(tokenAddress: string): Promise<Transaction> {
        return this._createExecutionTx(tokenAddress, "unpause", { type: "unpause" })
    }

    /**
     * Creates a transfer ownership transaction.
     *
     * @param tokenAddress - Token contract address
     * @param newOwner - New owner address
     * @returns Unsigned transaction
     */
    async transferOwnership(tokenAddress: string, newOwner: string): Promise<Transaction> {
        return this._createExecutionTx(tokenAddress, "transferOwnership", {
            type: "transferOwnership",
            newOwner,
        })
    }

    /**
     * Creates a grant permissions transaction.
     *
     * @param tokenAddress - Token contract address
     * @param address - Address to grant permissions to
     * @param permissions - Permissions to grant
     * @returns Unsigned transaction
     */
    async grantPermissions(
        tokenAddress: string,
        address: string,
        permissions: string[]
    ): Promise<Transaction> {
        const args: TokenACLArgs = {
            type: "modifyACL",
            action: "grant",
            address,
            permissions,
        }
        return this._createExecutionTx(tokenAddress, "modifyACL", args)
    }

    /**
     * Creates a revoke permissions transaction.
     *
     * @param tokenAddress - Token contract address
     * @param address - Address to revoke permissions from
     * @param permissions - Permissions to revoke
     * @returns Unsigned transaction
     */
    async revokePermissions(
        tokenAddress: string,
        address: string,
        permissions: string[]
    ): Promise<Transaction> {
        const args: TokenACLArgs = {
            type: "modifyACL",
            action: "revoke",
            address,
            permissions,
        }
        return this._createExecutionTx(tokenAddress, "modifyACL", args)
    }

    /**
     * Creates a script upgrade transaction.
     *
     * @param tokenAddress - Token contract address
     * @param newCode - New script code
     * @param newMethods - New method definitions
     * @param newHooks - New hooks to activate
     * @returns Unsigned transaction
     */
    async upgradeScript(
        tokenAddress: string,
        newCode: string,
        newMethods: TokenScriptMethod[],
        newHooks: TokenHookType[]
    ): Promise<Transaction> {
        const args: TokenUpgradeArgs = {
            type: "upgradeScript",
            newCode,
            newMethods,
            newHooks,
        }
        return this._createExecutionTx(tokenAddress, "upgradeScript", args)
    }

    /**
     * Calls a custom script method.
     *
     * @param tokenAddress - Token contract address
     * @param method - Method name
     * @param params - Method parameters
     * @returns Unsigned transaction
     */
    async callMethod(
        tokenAddress: string,
        method: string,
        params: unknown[]
    ): Promise<Transaction> {
        const args: TokenCustomArgs = { type: "custom", method, params }
        return this._createExecutionTx(tokenAddress, "custom", args)
    }

    // SECTION: Token Queries (via nodeCall)

    /**
     * Gets token information.
     *
     * @param tokenAddress - Token contract address
     * @returns Token query result
     */
    async getToken(tokenAddress: string): Promise<TokenQueryResult> {
        return this.demos.nodeCall("token.getToken", { tokenAddress })
    }

    /**
     * Gets token balance for an address.
     *
     * @param tokenAddress - Token contract address
     * @param holderAddress - Holder address
     * @returns Balance result
     */
    async getBalance(tokenAddress: string, holderAddress: string): Promise<TokenBalanceResult> {
        return this.demos.nodeCall("token.getBalance", { tokenAddress, holderAddress })
    }

    /**
     * Gets allowance for spender.
     *
     * @param tokenAddress - Token contract address
     * @param ownerAddress - Owner address
     * @param spenderAddress - Spender address
     * @returns Allowance amount as string
     */
    async getAllowance(
        tokenAddress: string,
        ownerAddress: string,
        spenderAddress: string
    ): Promise<string> {
        return this.demos.nodeCall("token.getAllowance", {
            tokenAddress,
            ownerAddress,
            spenderAddress,
        })
    }

    /**
     * Gets all tokens held by an address.
     *
     * @param holderAddress - Holder address
     * @returns Array of token references
     */
    async getTokensOf(holderAddress: string): Promise<TokenBalanceResult[]> {
        return this.demos.nodeCall("token.getTokensOf", { holderAddress })
    }

    /**
     * Calls a view function on a scripted token (read-only).
     *
     * @param tokenAddress - Token contract address
     * @param method - Method name
     * @param params - Method parameters
     * @returns Method return value
     */
    async callView(tokenAddress: string, method: string, params: unknown[]): Promise<unknown> {
        return this.demos.nodeCall("token.callView", { tokenAddress, method, params })
    }

    // SECTION: Private Helpers

    /**
     * Creates a token execution transaction.
     */
    private async _createExecutionTx(
        tokenAddress: string,
        operation: TokenOperationType,
        args: TokenExecutionPayload["args"]
    ): Promise<Transaction> {
        const payload: TokenExecutionPayload = {
            tokenAddress,
            operation,
            args,
        }

        const senderAddress = this.demos.getAddress()
        const nonce = await this.demos.getAddressNonce(senderAddress)

        const tx: Transaction = {
            content: {
                type: "tokenExecution",
                data: ["tokenExecution", payload],
                from: senderAddress,
                from_ed25519_address: await this.demos.getEd25519Address(),
                to: tokenAddress,
                amount: 0,
                timestamp: 0, // Will be set during signing
                nonce: nonce,
                transaction_fee: {
                    network_fee: 0,
                    rpc_fee: 0,
                    additional_fee: 0,
                },
                gcr_edits: [],
            },
            hash: "",
            signature: { type: "ed25519", data: "" },
            ed25519_signature: "",
            status: "pending",
            blockNumber: null,
        }

        return tx
    }
}

/**
 * Factory function to create DemosTokens instance.
 *
 * @param demos - Demos instance
 * @returns DemosTokens instance
 */
export function createTokensClient(demos: Demos): DemosTokens {
    return new DemosTokens(demos)
}
