/**
 * Token Types Module
 *
 * Exports all token-related types and utilities for the Demos Network.
 */

// Core types
export type {
    // Access Control
    TokenPermission,
    TokenACLEntry,
    TokenAccessControl,
    // Metadata
    TokenMetadata,
    // State
    TokenBalances,
    TokenAllowances,
    TokenCustomState,
    TokenState,
    // Script
    TokenHookType,
    TokenScriptMethod,
    TokenScript,
    // Complete structure
    TokenData,
    // Holder reference
    TokenHolderReference,
    // Script execution
    StateMutation,
    ScriptContext,
    ScriptExecutionResult,
    // Utility types
    TokenCreationParams,
    TokenQueryResult,
    TokenBalanceResult,
    // Upgrade types
    TokenUpgradePayload,
    TokenUpgradeResult,
    TokenUpgradeTransaction,
} from "./TokenTypes"

// Utility functions
export {
    // Address derivation
    deriveTokenAddress,
    computeScriptHash,
    // Serialization
    serializeTokenData,
    deserializeTokenData,
    balanceToString,
    stringToBalance,
    // Factory functions
    createInitialTokenState,
    createInitialAccessControl,
    createTokenMetadata,
    createHolderReference,
    // Validation
    isValidTicker,
    isValidTokenName,
    isValidDecimals,
    isValidBalance,
    validateTokenCreationParams,
    // Mutation helpers
    applyMutations,
    hasPermission,
} from "./TokenUtils"
