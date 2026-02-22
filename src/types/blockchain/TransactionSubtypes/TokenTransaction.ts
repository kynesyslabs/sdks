/**
 * Token Transaction Types
 *
 * Defines transaction subtypes for token operations:
 * - tokenCreation: Deploy new tokens
 * - tokenExecution: Execute token methods (transfer, mint, burn, etc.)
 */

import { Transaction, TransactionContent } from "../Transaction"
import type {
    TokenCreationParams,
    TokenHookType,
    TokenScriptMethod,
} from "@/types/token"

// SECTION: Token Creation Transaction

/**
 * Payload for creating a new token.
 */
export interface TokenCreationPayload {
    /** Token name (1-50 alphanumeric chars with spaces) */
    name: string
    /** Token ticker (1-10 uppercase alphanumeric chars) */
    ticker: string
    /** Decimal places (0-18) */
    decimals: number
    /** Initial supply as string (bigint serialization) */
    initialSupply: string
    /** Optional script for advanced tokens */
    script?: {
        code: string
        methods: TokenScriptMethod[]
        hooks: TokenHookType[]
    }
    /** Initial ACL entries (owner is always included) */
    initialACL?: Array<{
        address: string
        permissions: string[]
    }>
}

export type TokenCreationTransactionContent = Omit<TransactionContent, "type" | "data"> & {
    type: "tokenCreation"
    data: ["tokenCreation", TokenCreationPayload]
}

export interface TokenCreationTransaction extends Omit<Transaction, "content"> {
    content: TokenCreationTransactionContent
}

// SECTION: Token Execution Transaction

/**
 * Standard token operation types.
 */
export type TokenOperationType =
    | "transfer"
    | "approve"
    | "transferFrom"
    | "mint"
    | "burn"
    | "pause"
    | "unpause"
    | "transferOwnership"
    | "modifyACL"
    | "upgradeScript"
    | "custom" // For script-defined methods

/**
 * Payload for executing token operations.
 */
export interface TokenExecutionPayload {
    /** Token address (derived from deployer + nonce + hash) */
    tokenAddress: string
    /** Operation type */
    operation: TokenOperationType
    /** Operation arguments - structure depends on operation type */
    args: TokenOperationArgs
}

/**
 * Union of all possible operation argument structures.
 */
export type TokenOperationArgs =
    | TokenTransferArgs
    | TokenApproveArgs
    | TokenTransferFromArgs
    | TokenMintArgs
    | TokenBurnArgs
    | TokenPauseArgs
    | TokenOwnershipArgs
    | TokenACLArgs
    | TokenUpgradeArgs
    | TokenCustomArgs

/**
 * Arguments for transfer operation.
 */
export interface TokenTransferArgs {
    type: "transfer"
    to: string
    amount: string
}

/**
 * Arguments for approve operation.
 */
export interface TokenApproveArgs {
    type: "approve"
    spender: string
    amount: string
}

/**
 * Arguments for transferFrom operation.
 */
export interface TokenTransferFromArgs {
    type: "transferFrom"
    from: string
    to: string
    amount: string
}

/**
 * Arguments for mint operation.
 */
export interface TokenMintArgs {
    type: "mint"
    to: string
    amount: string
}

/**
 * Arguments for burn operation.
 */
export interface TokenBurnArgs {
    type: "burn"
    from: string
    amount: string
}

/**
 * Arguments for pause/unpause operations.
 */
export interface TokenPauseArgs {
    type: "pause" | "unpause"
}

/**
 * Arguments for ownership transfer.
 */
export interface TokenOwnershipArgs {
    type: "transferOwnership"
    newOwner: string
}

/**
 * Arguments for ACL modification.
 */
export interface TokenACLArgs {
    type: "modifyACL"
    action: "grant" | "revoke"
    address: string
    permissions: string[]
}

/**
 * Arguments for script upgrade.
 */
export interface TokenUpgradeArgs {
    type: "upgradeScript"
    newCode: string
    newMethods: TokenScriptMethod[]
    newHooks: TokenHookType[]
}

/**
 * Arguments for custom script methods.
 */
export interface TokenCustomArgs {
    type: "custom"
    method: string
    params: unknown[]
}

export type TokenExecutionTransactionContent = Omit<TransactionContent, "type" | "data"> & {
    type: "tokenExecution"
    data: ["tokenExecution", TokenExecutionPayload]
}

export interface TokenExecutionTransaction extends Omit<Transaction, "content"> {
    content: TokenExecutionTransactionContent
}

// SECTION: Type Guards

/**
 * Type guard for TokenCreationPayload.
 */
export function isTokenCreationPayload(payload: unknown): payload is TokenCreationPayload {
    if (typeof payload !== "object" || payload === null) return false
    const p = payload as Record<string, unknown>
    return (
        typeof p.name === "string" &&
        typeof p.ticker === "string" &&
        typeof p.decimals === "number" &&
        typeof p.initialSupply === "string"
    )
}

/**
 * Type guard for TokenExecutionPayload.
 */
export function isTokenExecutionPayload(payload: unknown): payload is TokenExecutionPayload {
    if (typeof payload !== "object" || payload === null) return false
    const p = payload as Record<string, unknown>
    return (
        typeof p.tokenAddress === "string" &&
        typeof p.operation === "string" &&
        typeof p.args === "object"
    )
}

/**
 * Type guard for TokenCreationTransaction.
 */
export function isTokenCreationTransaction(tx: Transaction): tx is TokenCreationTransaction {
    return (
        tx.content.type === "tokenCreation" &&
        Array.isArray(tx.content.data) &&
        tx.content.data[0] === "tokenCreation"
    )
}

/**
 * Type guard for TokenExecutionTransaction.
 */
export function isTokenExecutionTransaction(tx: Transaction): tx is TokenExecutionTransaction {
    return (
        tx.content.type === "tokenExecution" &&
        Array.isArray(tx.content.data) &&
        tx.content.data[0] === "tokenExecution"
    )
}
