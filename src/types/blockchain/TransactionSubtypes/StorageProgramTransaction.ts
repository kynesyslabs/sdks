import { Transaction, TransactionContent } from "../Transaction"

// REVIEW: Unified Storage Program transaction types for both JSON and Binary storage

// ============================================================================
// Constants
// ============================================================================

/**
 * Storage Program constants for validation and pricing
 */
export const STORAGE_PROGRAM_CONSTANTS = {
    /** Maximum storage size in bytes (1MB) */
    MAX_SIZE_BYTES: 1048576,

    /** Size chunk for pricing in bytes (10KB) */
    PRICING_CHUNK_BYTES: 10240,

    /** Fee per chunk in DEM */
    FEE_PER_CHUNK: 1n,

    /** Maximum nesting depth for JSON encoding */
    MAX_JSON_NESTING_DEPTH: 64,
} as const

// ============================================================================
// Storage Program Operations
// ============================================================================

/**
 * Storage Program operations
 *
 * - CREATE_STORAGE_PROGRAM: Initialize a new storage program with access control
 * - WRITE_STORAGE: Write/update data in the storage
 * - READ_STORAGE: Query operation (not a transaction, used for validation)
 * - UPDATE_ACCESS_CONTROL: Modify access control settings (owner only)
 * - DELETE_STORAGE_PROGRAM: Remove the entire storage program (owner/ACL permissioned)
 */
export type StorageProgramOperation =
    | "CREATE_STORAGE_PROGRAM"
    | "WRITE_STORAGE"
    | "READ_STORAGE"
    | "UPDATE_ACCESS_CONTROL"
    | "DELETE_STORAGE_PROGRAM"

// ============================================================================
// Encoding Types
// ============================================================================

/**
 * Storage encoding format
 * - json: Structured key-value data (Record<string, any>)
 * - binary: Raw binary data (base64 encoded string)
 */
export type StorageEncoding = "json" | "binary"

// ============================================================================
// Storage Location (Future IPFS Support)
// ============================================================================

/**
 * Storage location type
 * - onchain: Stored directly in PostgreSQL (current implementation)
 * - ipfs: Stored on IPFS with CID reference (future - not yet implemented)
 */
export type StorageLocation = "onchain" | "ipfs"

// ============================================================================
// Access Control
// ============================================================================

/**
 * Access control mode determining default behavior
 * - owner: Only owner can read and write (most restrictive)
 * - public: Anyone can read, only owner can write
 * - restricted: Only addresses in allowed/groups can access
 */
export type StorageACLMode = "owner" | "public" | "restricted"

/**
 * Group permissions for access control
 */
export interface StorageGroupPermissions {
    /** Member addresses in this group */
    members: string[]
    /** Permissions granted to group members */
    permissions: ("read" | "write" | "delete")[]
}

/**
 * Robust Access Control for Storage Programs
 * Applies to both JSON and Binary encodings
 *
 * ACL Resolution Priority:
 * 1. Owner -> FULL ACCESS (always)
 * 2. Blacklisted -> DENIED (even if in allowed/groups)
 * 3. Allowed -> permissions granted
 * 4. Groups -> check group permissions
 * 5. Mode fallback:
 *    - "owner" -> DENIED
 *    - "public" -> READ only
 *    - "restricted" -> DENIED
 */
export interface StorageProgramACL {
    /** Access mode determining default behavior */
    mode: StorageACLMode
    /** Addresses explicitly allowed to read/write */
    allowed?: string[]
    /** Addresses explicitly blocked (takes precedence over allowed/groups) */
    blacklisted?: string[]
    /** Named groups with member addresses and permissions */
    groups?: Record<string, StorageGroupPermissions>
}

// ============================================================================
// Legacy Access Control (Backward Compatibility)
// ============================================================================

/**
 * @deprecated Use StorageProgramACL instead. Kept for backward compatibility.
 */
export type StorageProgramAccessControl = "private" | "public" | "restricted" | "deployer-only"

// ============================================================================
// Payload Interface
// ============================================================================

/**
 * Storage Program payload for transaction data
 *
 * Unified payload supporting both JSON and Binary encodings with robust ACL.
 */
export interface StorageProgramPayload {
    /** The storage operation to perform */
    operation: StorageProgramOperation

    /** The storage program address (stor-{hash format}) */
    storageAddress: string

    /** Name of the storage program (required for CREATE_STORAGE_PROGRAM) */
    programName?: string

    /**
     * Encoding format for the data
     * - json: data field contains Record<string, any>
     * - binary: data field contains base64 string
     * @default "json"
     */
    encoding?: StorageEncoding

    /**
     * Data to store
     * - For json encoding: Record<string, any> (max 64 nesting levels)
     * - For binary encoding: base64 encoded string
     * Max size: 1MB for both
     */
    data?: Record<string, any> | string

    /**
     * Robust access control configuration (new)
     * Supports owner, allowed, blacklisted, public, and groups
     */
    acl?: StorageProgramACL

    /**
     * @deprecated Use acl instead. Kept for backward compatibility.
     * Simple access control mode
     */
    accessControl?: StorageProgramAccessControl

    /**
     * @deprecated Use acl.allowed instead. Kept for backward compatibility.
     * Allowed addresses for 'restricted' access control
     */
    allowedAddresses?: string[]

    /** Random salt for deterministic address derivation (optional) */
    salt?: string

    /** Optional metadata (filename, mimeType, description, etc.) */
    metadata?: Record<string, unknown>

    /**
     * Storage location preference
     * @default "onchain"
     * Note: "ipfs" is not yet implemented, will fall back to "onchain"
     */
    storageLocation?: StorageLocation
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction content type for Storage Program operations.
 * Extends the base TransactionContent with storageProgram-specific type and data.
 */
export type StorageProgramTransactionContent = Omit<TransactionContent, "type" | "data"> & {
    type: "storageProgram"
    data: ["storageProgram", StorageProgramPayload]
}

/**
 * Complete Storage Program transaction interface.
 * Used for unified storage on the blockchain with access control.
 *
 * Storage Programs support:
 * - Dual encoding: JSON (structured) or Binary (raw)
 * - Max size: 1MB for both encodings
 * - Pricing: 1 DEM per 10KB
 * - Robust ACL: owner, allowed, blacklisted, public, groups
 * - Permanent storage, owner/ACL-deletable only
 * - IPFS-ready (stubs for future hybrid storage)
 *
 * @see feature_storage_programs_plan.md for complete specification
 */
export interface StorageProgramTransaction extends Omit<Transaction, "content"> {
    content: StorageProgramTransactionContent
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a payload is a StorageProgram payload
 */
export function isStorageProgramPayload(payload: unknown): payload is StorageProgramPayload {
    if (!payload || typeof payload !== "object") return false
    const p = payload as Record<string, unknown>
    return (
        typeof p.operation === "string" &&
        typeof p.storageAddress === "string" &&
        ["CREATE_STORAGE_PROGRAM", "WRITE_STORAGE", "READ_STORAGE", "UPDATE_ACCESS_CONTROL", "DELETE_STORAGE_PROGRAM"].includes(p.operation as string)
    )
}

/**
 * Check if encoding is valid
 */
export function isValidEncoding(encoding: unknown): encoding is StorageEncoding {
    return encoding === "json" || encoding === "binary"
}

/**
 * Check if storage location is valid
 */
export function isValidStorageLocation(location: unknown): location is StorageLocation {
    return location === "onchain" || location === "ipfs"
}
