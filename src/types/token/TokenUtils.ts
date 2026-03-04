/**
 * Token Utility Functions
 *
 * Provides address derivation, serialization, and validation utilities.
 */

import { createHash } from "crypto"
import type {
    TokenData,
    TokenMetadata,
    TokenState,
    TokenAccessControl,
    TokenCreationParams,
    TokenBalances,
    TokenHolderReference,
    StateMutation,
} from "./TokenTypes"

// SECTION: Address Derivation

/**
 * Derives a deterministic token address from deployer info and token params.
 * Formula: sha256(deployer + nonce + hash(tokenObject))
 *
 * @param deployer - Deployer's address
 * @param nonce - Deployer's nonce at deployment time
 * @param tokenParams - Token creation parameters
 * @returns Deterministic token address (0x-prefixed)
 */
export function deriveTokenAddress(
    deployer: string,
    nonce: number,
    tokenParams: TokenCreationParams
): string {
    // Create deterministic hash of token parameters
    const tokenParamsHash = createHash("sha256")
        .update(
            JSON.stringify({
                name: tokenParams.name,
                ticker: tokenParams.ticker,
                decimals: tokenParams.decimals,
                initialSupply: tokenParams.initialSupply,
                // Include script hash if present
                scriptCode: tokenParams.script?.code ?? "",
            })
        )
        .digest("hex")

    // Combine deployer + nonce + token hash
    const combined = `${deployer}:${nonce}:${tokenParamsHash}`

    // Final address derivation
    const addressHash = createHash("sha256").update(combined).digest("hex")

    // Return with 0x prefix, truncated to 40 chars (20 bytes) like Ethereum addresses
    return `0x${addressHash.slice(0, 40)}`
}

/**
 * Computes the hash of script code for verification.
 *
 * @param code - Script source code
 * @returns SHA256 hash of the code
 */
export function computeScriptHash(code: string): string {
    return createHash("sha256").update(code).digest("hex")
}

// SECTION: Serialization

/**
 * Serializes TokenData for GCR storage.
 * Ensures consistent serialization for consensus.
 */
export function serializeTokenData(data: TokenData): string {
    return JSON.stringify(data, Object.keys(data).sort())
}

/**
 * Deserializes TokenData from GCR storage.
 */
export function deserializeTokenData(serialized: string): TokenData {
    return JSON.parse(serialized) as TokenData
}

/**
 * Converts a bigint balance to string for storage.
 */
export function balanceToString(balance: bigint): string {
    return balance.toString()
}

/**
 * Converts a string balance back to bigint for calculations.
 */
export function stringToBalance(str: string): bigint {
    return BigInt(str)
}

// SECTION: Factory Functions

/**
 * Creates initial token state from creation parameters.
 */
export function createInitialTokenState(
    params: TokenCreationParams,
    deployerAddress: string
): TokenState {
    const balances: TokenBalances = {}
    // Assign initial supply to deployer
    if (params.initialSupply !== "0") {
        balances[deployerAddress] = params.initialSupply
    }

    return {
        totalSupply: params.initialSupply,
        balances,
        allowances: {},
        customState: {},
    }
}

/**
 * Creates initial access control with deployer as owner.
 */
export function createInitialAccessControl(
    ownerAddress: string,
    timestamp: number,
    initialACL?: TokenCreationParams["initialACL"]
): TokenAccessControl {
    const entries = initialACL?.map((entry) => ({
        ...entry,
        grantedAt: timestamp,
        grantedBy: ownerAddress,
    })) ?? []

    return {
        owner: ownerAddress,
        paused: false,
        entries,
    }
}

/**
 * Creates complete TokenMetadata from creation parameters.
 */
export function createTokenMetadata(
    params: TokenCreationParams,
    deployerAddress: string,
    deployerNonce: number,
    timestamp: number
): TokenMetadata {
    const address = deriveTokenAddress(deployerAddress, deployerNonce, params)

    return {
        name: params.name,
        ticker: params.ticker,
        decimals: params.decimals,
        address,
        deployer: deployerAddress,
        deployerNonce,
        deployedAt: timestamp,
        hasScript: !!params.script,
    }
}

/**
 * Creates a holder reference for storage in GCRExtended.tokens
 */
export function createHolderReference(metadata: TokenMetadata): TokenHolderReference {
    return {
        tokenAddress: metadata.address,
        ticker: metadata.ticker,
        name: metadata.name,
        decimals: metadata.decimals,
    }
}

// SECTION: Validation

/**
 * Validates token ticker format.
 * Must be 1-10 uppercase alphanumeric characters.
 */
export function isValidTicker(ticker: string): boolean {
    return /^[A-Z0-9]{1,10}$/.test(ticker)
}

/**
 * Validates token name.
 * Must be 1-50 characters, alphanumeric with spaces.
 */
export function isValidTokenName(name: string): boolean {
    return /^[a-zA-Z0-9 ]{1,50}$/.test(name)
}

/**
 * Validates decimals range.
 * Must be 0-18 (like most blockchain tokens).
 */
export function isValidDecimals(decimals: number): boolean {
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18
}

/**
 * Validates a balance string is a valid non-negative integer.
 */
export function isValidBalance(balance: string): boolean {
    try {
        const value = BigInt(balance)
        return value >= 0n
    } catch {
        return false
    }
}

/**
 * Validates token creation parameters.
 */
export function validateTokenCreationParams(
    params: TokenCreationParams
): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!isValidTokenName(params.name)) {
        errors.push("Invalid token name: must be 1-50 alphanumeric characters")
    }

    if (!isValidTicker(params.ticker)) {
        errors.push("Invalid ticker: must be 1-10 uppercase alphanumeric characters")
    }

    if (!isValidDecimals(params.decimals)) {
        errors.push("Invalid decimals: must be integer 0-18")
    }

    if (!isValidBalance(params.initialSupply)) {
        errors.push("Invalid initial supply: must be non-negative integer string")
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

// SECTION: Mutation Helpers

/**
 * Applies a list of state mutations to token state.
 * Used after script execution to update state.
 *
 * @param state - Current token state
 * @param mutations - List of mutations to apply
 * @returns New token state with mutations applied
 */
export function applyMutations(
    state: TokenState,
    mutations: StateMutation[]
): TokenState {
    // Deep clone state to avoid mutation
    const newState: TokenState = JSON.parse(JSON.stringify(state))

    for (const mutation of mutations) {
        switch (mutation.type) {
            case "setBalance":
                if (mutation.address && typeof mutation.value === "string") {
                    newState.balances[mutation.address] = mutation.value
                }
                break

            case "addBalance":
                if (mutation.address && typeof mutation.value === "string") {
                    const current = BigInt(newState.balances[mutation.address] ?? "0")
                    const add = BigInt(mutation.value)
                    newState.balances[mutation.address] = (current + add).toString()
                }
                break

            case "subBalance":
                if (mutation.address && typeof mutation.value === "string") {
                    const current = BigInt(newState.balances[mutation.address] ?? "0")
                    const sub = BigInt(mutation.value)
                    if (current < sub) {
                        throw new Error(`Insufficient balance for ${mutation.address}`)
                    }
                    newState.balances[mutation.address] = (current - sub).toString()
                }
                break

            case "setAllowance":
                if (
                    mutation.address &&
                    mutation.spender &&
                    typeof mutation.value === "string"
                ) {
                    if (!newState.allowances[mutation.address]) {
                        newState.allowances[mutation.address] = {}
                    }
                    newState.allowances[mutation.address][mutation.spender] = mutation.value
                }
                break

            case "setCustomState":
                if (mutation.key !== undefined) {
                    newState.customState[mutation.key] = mutation.value
                }
                break
        }
    }

    // Recalculate total supply from balances
    let total = 0n
    for (const balance of Object.values(newState.balances)) {
        total += BigInt(balance)
    }
    newState.totalSupply = total.toString()

    return newState
}

/**
 * Checks if an address has a specific permission.
 */
export function hasPermission(
    accessControl: TokenAccessControl,
    address: string,
    permission: string
): boolean {
    // Owner has all permissions
    if (accessControl.owner === address) {
        return true
    }

    // Check ACL entries
    const entry = accessControl.entries.find((e) => e.address === address)
    if (!entry) {
        return false
    }

    return entry.permissions.includes(permission as any)
}
