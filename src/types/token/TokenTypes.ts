/**
 * Token Types for Demos Network
 *
 * Defines the core data structures for fungible tokens with scripting support.
 * Tokens are stored as GCR accounts with special properties in the data field.
 *
 * Storage Model:
 * - Token data stored in token's GCR `details.content.token`
 * - Holder pointers stored in holder's `GCRExtended.tokens` array
 */

// SECTION: Permission-based Access Control

/**
 * Permission flags for token access control.
 * Each permission can be granted to addresses in the ACL.
 */
export type TokenPermission =
    | "canMint"
    | "canBurn"
    | "canUpgrade"
    | "canPause"
    | "canTransferOwnership"
    | "canModifyACL"
    | "canExecuteScript"

/**
 * Access Control List entry for a single address.
 */
export interface TokenACLEntry {
    address: string
    permissions: TokenPermission[]
    grantedAt: number // Unix timestamp
    grantedBy: string // Address that granted permissions
}

/**
 * Token Access Control structure.
 * Owner has all permissions by default.
 */
export interface TokenAccessControl {
    owner: string
    paused: boolean
    entries: TokenACLEntry[]
}

// SECTION: Token Metadata

/**
 * Immutable token metadata set at creation time.
 */
export interface TokenMetadata {
    name: string
    ticker: string
    decimals: number
    // Address derived from: sha256(deployer + nonce + hash(tokenObject))
    address: string
    // Deployer information
    deployer: string
    deployerNonce: number
    deployedAt: number // Unix timestamp (block timestamp at deployment)
    // Script support flag
    hasScript: boolean
}

// SECTION: Token State

/**
 * Token balances mapping: address -> balance
 * Stored centrally in the token's GCR
 */
export type TokenBalances = Record<string, string> // string for bigint serialization

/**
 * Token allowances mapping: owner -> spender -> amount
 * For ERC20-like approve/transferFrom pattern
 */
export type TokenAllowances = Record<string, Record<string, string>>

/**
 * Custom state for scripted tokens.
 * Scripts can store arbitrary data here.
 */
export type TokenCustomState = Record<string, unknown>

/**
 * Complete token state.
 */
export interface TokenState {
    totalSupply: string // string for bigint serialization
    balances: TokenBalances
    allowances: TokenAllowances
    // Custom state for scripted logic
    customState: TokenCustomState
}

// SECTION: Script Definitions

/**
 * Hook types that can trigger script execution.
 * Hooks EXTEND native operations, they don't override them.
 */
export type TokenHookType =
    | "beforeTransfer"
    | "afterTransfer"
    | "beforeMint"
    | "afterMint"
    | "beforeBurn"
    | "afterBurn"
    | "onApprove"

/**
 * Script method definition for custom token logic.
 */
export interface TokenScriptMethod {
    name: string
    // Method signature for validation
    params: Array<{ name: string; type: string }>
    // Return type hint
    returns?: string
    // Whether this method modifies state (true) or is read-only (false)
    mutates: boolean
}

/**
 * Token script definition.
 * Contains the script code and method signatures.
 */
export interface TokenScript {
    // Version for upgrade tracking
    version: number
    // The actual script code (TypeScript subset)
    code: string
    // Defined methods
    methods: TokenScriptMethod[]
    // Active hooks
    hooks: TokenHookType[]
    // Script hash for verification
    codeHash: string
    // Last upgrade timestamp
    upgradedAt: number
}

// SECTION: Complete Token Structure

/**
 * Complete token data as stored in GCR.
 * This is the full structure stored in `details.content.token`
 */
export interface TokenData {
    metadata: TokenMetadata
    state: TokenState
    accessControl: TokenAccessControl
    script?: TokenScript // Optional - tokens can be "simple" without scripts
}

// SECTION: Holder Reference

/**
 * Lightweight token reference stored in holder's GCRExtended.tokens
 * Points to the token GCR for full data lookup
 */
export interface TokenHolderReference {
    tokenAddress: string
    // Cached for quick display (not authoritative - token GCR is source of truth)
    ticker: string
    name: string
    decimals: number
}

// SECTION: Script Execution Types

/**
 * State mutation returned by scripts.
 * Scripts return a list of mutations, not the new state directly.
 */
export interface StateMutation {
    type: "setBalance" | "addBalance" | "subBalance" | "setCustomState" | "setAllowance"
    // Target address for balance operations
    address?: string
    // Spender address for allowance operations
    spender?: string
    // Value for the operation
    value: string | number | Record<string, unknown>
    // Key for custom state operations
    key?: string
}

/**
 * Context provided to script execution.
 * Contains deterministic values only.
 */
export interface ScriptContext {
    caller: string
    method: string
    args: unknown[]
    // Read-only snapshot of token state
    tokenState: Readonly<TokenState>
    tokenMetadata: Readonly<TokenMetadata>
    // Deterministic values
    txTimestamp: number
    prevBlockHash: string
    blockHeight: number
}

/**
 * Result of script execution.
 */
export interface ScriptExecutionResult {
    success: boolean
    mutations: StateMutation[]
    returnValue?: unknown
    error?: string
    // Gas/complexity metrics for fee calculation
    complexity: number
}

// SECTION: Utility Types

/**
 * Token creation parameters.
 */
export interface TokenCreationParams {
    name: string
    ticker: string
    decimals: number
    initialSupply: string
    // Optional script for advanced tokens
    script?: {
        code: string
        methods: TokenScriptMethod[]
        hooks: TokenHookType[]
    }
    // Initial ACL entries (owner is always included)
    initialACL?: Omit<TokenACLEntry, "grantedAt" | "grantedBy">[]
}

/**
 * Token query result for nodeCall responses.
 */
export interface TokenQueryResult {
    exists: boolean
    metadata?: TokenMetadata
    state?: TokenState
    accessControl?: TokenAccessControl
    hasScript?: boolean
}

/**
 * Token balance query result.
 */
export interface TokenBalanceResult {
    tokenAddress: string
    holderAddress: string
    balance: string
    decimals: number
    ticker: string
}
