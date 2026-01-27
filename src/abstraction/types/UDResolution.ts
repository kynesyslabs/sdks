/**
 * Unstoppable Domains Multi-Chain Resolution Types
 *
 * These types represent the structures returned by UD resolution
 * on both EVM and Solana chains, supporting multi-address verification.
 */

// ============================================================================
// Common Types
// ============================================================================

/**
 * Signature types supported for UD identity verification
 */
export type SignatureType = "evm" | "solana"

/**
 * Blockchain networks where UD domains can be registered
 */
export type UDNetwork = "polygon" | "ethereum" | "base" | "sonic" | "solana"

/**
 * Registry types for UD domains
 */
export type UDRegistryType = "UNS" | "CNS"

/**
 * Standard UD record keys for crypto addresses
 */
export type UDRecordKey =
    | "crypto.ETH.address"
    | "crypto.SOL.address"
    | "crypto.BTC.address"
    | "crypto.MATIC.address"
    | `token.EVM.${string}.${string}.address`
    | `token.SOL.${string}.${string}.address`
    | `ipfs.${string}.value`
    | `dns.${string}`

// ============================================================================
// Solana Resolution Types (from SolanaDomainResolver)
// ============================================================================

/**
 * Result of resolving a single record on Solana
 */
export interface SolanaRecordResult {
    /** The record key that was queried */
    key: string
    /** The resolved value, or null if not found */
    value: string | null
    /** Whether the record was successfully found */
    found: boolean
    /** Error message if resolution failed */
    error?: string
}

/**
 * Complete Solana domain resolution result
 */
export interface SolanaDomainResolution {
    /** The full domain name (label.tld) */
    domain: string
    /** Whether the domain exists on-chain */
    exists: boolean
    /** The derived SLD PDA address */
    sldPda: string
    /** Domain properties PDA address */
    domainPropertiesPda?: string
    /** Records version from domain properties */
    recordsVersion?: number
    /** Array of record resolution results */
    records: SolanaRecordResult[]
    /** Any error that occurred during resolution */
    error?: string
}

// ============================================================================
// EVM Resolution Types
// ============================================================================

/**
 * EVM domain resolution result with records
 */
export interface EVMDomainResolution {
    /** The full domain name */
    domain: string
    /** Network where domain was found */
    network: "polygon" | "ethereum" | "base" | "sonic"
    /** Token ID (namehash of domain) */
    tokenId: string
    /** Domain owner address */
    owner: string
    /** Resolver contract address */
    resolver: string
    /** Record key-value pairs (null if not found) */
    records: Record<string, string | null>
}

// ============================================================================
// Unified Resolution Types
// ============================================================================

/**
 * A signable address extracted from domain records
 */
export interface SignableAddress {
    /** The blockchain address */
    address: string
    /** Record key this address came from */
    recordKey: string
    /** Signature type (evm or solana) */
    signatureType: SignatureType
}

/**
 * Unified domain resolution result (EVM or Solana)
 */
export interface UnifiedDomainResolution {
    /** The full domain name */
    domain: string
    /** Network where domain was found */
    network: UDNetwork
    /** Registry type */
    registryType: UDRegistryType
    /** Array of addresses that can sign challenges */
    authorizedAddresses: SignableAddress[]
    /** Additional metadata (chain-specific) */
    metadata?: {
        /** EVM-specific data */
        evm?: {
            tokenId: string
            owner: string
            resolver: string
        }
        /** Solana-specific data */
        solana?: {
            sldPda: string
            domainPropertiesPda: string
            recordsVersion: number
            owner: string
        }
    }
}

// ============================================================================
// Identity Verification Payload Types (NEW)
// ============================================================================

/**
 * Payload for UD identity assignment request (UPDATED)
 */
export interface UDIdentityAssignPayload {
    type: "ud"
    payload: {
        /** The UD domain being linked */
        domain: string
        /** The address that signed the challenge */
        signingAddress: string
        /** Type of signature (auto-detected from address) */
        signatureType: SignatureType
        /** Signature of the challenge */
        signature: string
        /** Challenge message that was signed */
        signedData: string
        /** Public key (for Solana verification) */
        publicKey: string
        /** Network where domain is registered */
        network: UDNetwork
        /** Registry type */
        registryType: UDRegistryType
        /** Timestamp of signing */
        timestamp: number
    }
}

/**
 * UD identity payload (simplified)
 */
export type UDIdentityPayload = UDIdentityAssignPayload["payload"]

// ============================================================================
// Helper Functions Export Interfaces
// ============================================================================

/**
 * Configuration for UD resolution
 */
export interface UDResolutionConfig {
    /** Solana RPC URL (optional) */
    solanaRpcUrl?: string
    /** Ethereum RPC URL (optional) */
    ethereumRpcUrl?: string
    /** Polygon RPC URL (optional) */
    polygonRpcUrl?: string
}

/**
 * Result of address type detection
 */
export interface AddressTypeInfo {
    address: string
    type: SignatureType | null
    isSignable: boolean
}
