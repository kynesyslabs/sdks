import { sha256 } from "js-sha256"
import axios from "axios"
import type {
    StorageProgramPayload,
    StorageProgramACL,
    StorageACLMode,
    StorageEncoding,
    StorageLocation,
    StorageGroupPermissions,
    StorageProgramAccessControl,
} from "../types/blockchain/TransactionSubtypes/StorageProgramTransaction"
import { STORAGE_PROGRAM_CONSTANTS } from "../types/blockchain/TransactionSubtypes/StorageProgramTransaction"

// ============================================================================
// Query Response Types
// ============================================================================

/**
 * Storage program data returned from RPC queries
 */
export interface StorageProgramData {
    storageAddress: string
    owner: string
    programName: string
    encoding: "json" | "binary"
    data?: Record<string, unknown> | string | null
    metadata?: Record<string, unknown> | null
    storageLocation: string
    sizeBytes: number
    createdAt: string
    updatedAt: string
}

/**
 * Storage program list item (without full data)
 */
export interface StorageProgramListItem {
    storageAddress: string
    programName: string
    encoding: "json" | "binary"
    sizeBytes: number
    storageLocation: string
    createdAt: string
    updatedAt: string
}

/**
 * Response from storage program RPC endpoints
 */
interface StorageProgramResponse {
    success: boolean
    storageAddress?: string
    owner?: string
    programName?: string
    encoding?: "json" | "binary"
    data?: Record<string, unknown> | string | null
    metadata?: Record<string, unknown> | null
    storageLocation?: string
    sizeBytes?: number
    createdAt?: string
    updatedAt?: string
    error?: string
    errorCode?: string
}

/**
 * Response from storage program list endpoints
 */
interface StorageProgramsListResponse {
    success: boolean
    programs?: StorageProgramListItem[]
    count?: number
    error?: string
}

// REVIEW: Unified Storage Program class for both JSON and Binary storage with robust ACL

/**
 * StorageProgram - Unified storage solution for Demos Network
 *
 * Supports both JSON (structured) and Binary (raw) data storage
 * with robust access control and size-based pricing.
 *
 * Features:
 * - Deterministic address derivation (stor-{sha256})
 * - Dual encoding: JSON key-value or raw binary
 * - Robust ACL: owner, allowed, blacklisted, public, groups
 * - Size limit: 1MB for both encodings
 * - Pricing: 1 DEM per 10KB
 * - Permanent storage, owner/ACL-deletable only
 * - IPFS-ready (stubs for future hybrid storage)
 *
 * @example
 * ```typescript
 * import { StorageProgram } from '@kynesyslabs/demosdk'
 *
 * // Create JSON storage program (nonce required for unique address)
 * const jsonPayload = StorageProgram.createStorageProgram(
 *   'demos1abc...',
 *   'myConfig',
 *   { apiKey: 'secret', settings: { theme: 'dark' } },
 *   'json',
 *   { mode: 'public' },
 *   { nonce: 42 }  // sender's current nonce
 * )
 *
 * // Create Binary storage program
 * const binaryPayload = StorageProgram.createStorageProgram(
 *   'demos1abc...',
 *   'myImage',
 *   Buffer.from(imageData).toString('base64'),
 *   'binary',
 *   { mode: 'restricted', allowed: ['demos1user1...'] },
 *   { nonce: 43, metadata: { filename: 'avatar.png', mimeType: 'image/png' } }
 * )
 * ```
 */
export class StorageProgram {
    // ========================================================================
    // Address Derivation
    // ========================================================================

    /**
     * Derive a deterministic storage program address
     *
     * @param deployerAddress - Address of the program deployer (will be owner)
     * @param programName - Name of the storage program
     * @param nonce - Sender's nonce for uniqueness (ensures unique address per transaction)
     * @param salt - Optional random salt for additional uniqueness (default: empty string)
     * @returns Storage address in format: stor-{first 40 chars of sha256}
     *
     * @example
     * ```typescript
     * const address = StorageProgram.deriveStorageAddress(
     *   'demos1abc...',
     *   'myConfig',
     *   42,  // nonce
     *   'salt123'
     * )
     * // Returns: 'stor-7a8b9c...' (40 chars after prefix)
     * ```
     */
    static deriveStorageAddress(
        deployerAddress: string,
        programName: string,
        nonce: number,
        salt: string = "",
    ): string {
        // Create hash input: deployerAddress:programName:nonce:salt
        // Nonce ensures uniqueness per transaction from same deployer
        const hashInput = `${deployerAddress}:${programName}:${nonce}:${salt}`

        // SHA-256 hash and take first 40 characters (using browser-compatible js-sha256)
        const hash = sha256(hashInput)
        const addressHash = hash.substring(0, 40)

        return `stor-${addressHash}`
    }

    // ========================================================================
    // Program Operations
    // ========================================================================

    /**
     * Create a new Storage Program
     *
     * @param deployerAddress - Address creating the storage program (becomes owner)
     * @param programName - Unique name for the program
     * @param data - Initial data (JSON object or base64 binary string)
     * @param encoding - "json" or "binary" (default: "json")
     * @param acl - Access control configuration (default: owner-only)
     * @param options - Options including nonce (required), salt, metadata, storageLocation
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * // JSON storage with public read access
     * const payload = StorageProgram.createStorageProgram(
     *   'demos1abc...',
     *   'appConfig',
     *   { version: '1.0', features: ['auth', 'storage'] },
     *   'json',
     *   { mode: 'public' },
     *   { nonce: 42 }  // Required: sender's current nonce
     * )
     *
     * // Binary storage with group access
     * const payload = StorageProgram.createStorageProgram(
     *   'demos1abc...',
     *   'teamDocument',
     *   base64EncodedPdf,
     *   'binary',
     *   {
     *     mode: 'restricted',
     *     groups: {
     *       editors: { members: ['demos1a...', 'demos1b...'], permissions: ['read', 'write'] },
     *       viewers: { members: ['demos1c...'], permissions: ['read'] }
     *     }
     *   },
     *   { nonce: 43, metadata: { filename: 'report.pdf', mimeType: 'application/pdf' } }
     * )
     * ```
     */
    static createStorageProgram(
        deployerAddress: string,
        programName: string,
        data: Record<string, any> | string,
        encoding: StorageEncoding = "json",
        acl?: Partial<StorageProgramACL>,
        options?: {
            nonce: number // Required: sender's nonce for unique address derivation
            salt?: string
            metadata?: Record<string, unknown>
            storageLocation?: StorageLocation
        },
    ): StorageProgramPayload {
        if (options?.nonce === undefined) {
            throw new Error("nonce is required for storage program creation")
        }

        const storageAddress = this.deriveStorageAddress(
            deployerAddress,
            programName,
            options.nonce,
            options?.salt || "",
        )

        const fullACL: StorageProgramACL = {
            mode: acl?.mode || "owner",
            allowed: acl?.allowed,
            blacklisted: acl?.blacklisted,
            groups: acl?.groups,
        }

        return {
            operation: "CREATE_STORAGE_PROGRAM",
            storageAddress,
            programName,
            encoding,
            data,
            acl: fullACL,
            salt: options?.salt,
            metadata: options?.metadata,
            storageLocation: options?.storageLocation || "onchain",
        }
    }

    /**
     * Write/update data in a Storage Program
     *
     * @param storageAddress - The storage program address (stor-{hash})
     * @param data - Data to write (JSON object or base64 binary string)
     * @param encoding - "json" or "binary" (default: "json")
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * // Update JSON data
     * const payload = StorageProgram.writeStorage(
     *   'stor-7a8b9c...',
     *   { newKey: 'value', existingKey: 'updatedValue' },
     *   'json'
     * )
     *
     * // Update binary data
     * const payload = StorageProgram.writeStorage(
     *   'stor-7a8b9c...',
     *   newBase64Content,
     *   'binary'
     * )
     * ```
     */
    static writeStorage(
        storageAddress: string,
        data: Record<string, any> | string,
        encoding: StorageEncoding = "json",
    ): StorageProgramPayload {
        return {
            operation: "WRITE_STORAGE",
            storageAddress,
            data,
            encoding,
        }
    }

    /**
     * Read data from a Storage Program (creates payload for RPC)
     *
     * Note: This creates a payload for validation purposes.
     * Actual reads should use RPC endpoints like GET /storage-program/:address
     *
     * @param storageAddress - The storage program address to read from
     * @returns StorageProgramPayload for validation
     *
     * @example
     * ```typescript
     * // For transaction validation (not typical usage)
     * const payload = StorageProgram.readStorage('stor-7a8b9c...')
     *
     * // Typical usage: Use RPC endpoint
     * // fetch(`${rpcUrl}/storage-program/${storageAddress}`)
     * ```
     */
    static readStorage(storageAddress: string): StorageProgramPayload {
        return {
            operation: "READ_STORAGE",
            storageAddress,
        }
    }

    /**
     * Update access control settings for a Storage Program (owner only)
     *
     * @param storageAddress - The storage program address
     * @param acl - New access control configuration
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * // Change to public access
     * const payload = StorageProgram.updateAccessControl(
     *   'stor-7a8b9c...',
     *   { mode: 'public' }
     * )
     *
     * // Add users to blacklist
     * const payload = StorageProgram.updateAccessControl(
     *   'stor-7a8b9c...',
     *   {
     *     mode: 'public',
     *     blacklisted: ['demos1bad...', 'demos1spam...']
     *   }
     * )
     *
     * // Set up group-based access
     * const payload = StorageProgram.updateAccessControl(
     *   'stor-7a8b9c...',
     *   {
     *     mode: 'restricted',
     *     groups: {
     *       admins: { members: ['demos1admin...'], permissions: ['read', 'write', 'delete'] },
     *       users: { members: ['demos1user1...', 'demos1user2...'], permissions: ['read'] }
     *     }
     *   }
     * )
     * ```
     */
    static updateAccessControl(
        storageAddress: string,
        acl: Partial<StorageProgramACL>,
    ): StorageProgramPayload {
        return {
            operation: "UPDATE_ACCESS_CONTROL",
            storageAddress,
            acl: acl as StorageProgramACL,
        }
    }

    /**
     * Delete a Storage Program (owner/ACL-permissioned only)
     *
     * WARNING: This operation is irreversible and will delete all stored data.
     *
     * @param storageAddress - The storage program address to delete
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * const payload = StorageProgram.deleteStorageProgram('stor-7a8b9c...')
     * ```
     */
    static deleteStorageProgram(storageAddress: string): StorageProgramPayload {
        return {
            operation: "DELETE_STORAGE_PROGRAM",
            storageAddress,
        }
    }

    // ========================================================================
    // Validation Helpers
    // ========================================================================

    /**
     * Validate data size against 1MB limit
     *
     * @param data - Data to validate (JSON object or base64 string)
     * @param encoding - Encoding type ("json" or "binary")
     * @returns true if size is within 1MB limit, false otherwise
     *
     * @example
     * ```typescript
     * // Validate JSON data
     * if (StorageProgram.validateSize({ key: 'value' }, 'json')) {
     *   // Safe to store
     * }
     *
     * // Validate binary data
     * if (StorageProgram.validateSize(base64String, 'binary')) {
     *   // Safe to store
     * }
     * ```
     */
    static validateSize(data: Record<string, any> | string, encoding: StorageEncoding = "json"): boolean {
        const sizeBytes = this.getDataSize(data, encoding)
        return sizeBytes <= STORAGE_PROGRAM_CONSTANTS.MAX_SIZE_BYTES
    }

    /**
     * Get data size in bytes
     *
     * @param data - Data to measure (JSON object or base64 string)
     * @param encoding - Encoding type ("json" or "binary")
     * @returns Size in bytes
     *
     * @example
     * ```typescript
     * const size = StorageProgram.getDataSize({ key: 'value' }, 'json')
     * console.log(`Data size: ${size} bytes`)
     * ```
     */
    static getDataSize(data: Record<string, any> | string, encoding: StorageEncoding = "json"): number {
        if (encoding === "binary") {
            // Binary data is base64 encoded, decode to get actual size
            // Base64 encoding: every 4 chars = 3 bytes
            const base64String = data as string
            // Remove padding and calculate
            const padding = (base64String.match(/=/g) || []).length
            return Math.floor((base64String.length * 3) / 4) - padding
        } else {
            // JSON data - measure serialized size
            const jsonString = JSON.stringify(data)
            return new TextEncoder().encode(jsonString).length
        }
    }

    /**
     * Calculate storage fee based on data size
     *
     * Pricing: 1 DEM per 10KB (minimum 1 DEM)
     *
     * @param data - Data to calculate fee for (JSON object or base64 string)
     * @param encoding - Encoding type ("json" or "binary")
     * @returns Fee in DEM (bigint)
     *
     * @example
     * ```typescript
     * const fee = StorageProgram.calculateStorageFee({ key: 'value' }, 'json')
     * console.log(`Storage fee: ${fee} DEM`)
     *
     * // Examples:
     * // 5KB -> 1 DEM
     * // 15KB -> 2 DEM
     * // 100KB -> 10 DEM
     * // 1MB -> 103 DEM
     * ```
     */
    static calculateStorageFee(data: Record<string, any> | string, encoding: StorageEncoding = "json"): bigint {
        const sizeBytes = this.getDataSize(data, encoding)
        const chunks = Math.ceil(sizeBytes / STORAGE_PROGRAM_CONSTANTS.PRICING_CHUNK_BYTES)
        return BigInt(Math.max(1, chunks)) * STORAGE_PROGRAM_CONSTANTS.FEE_PER_CHUNK
    }

    /**
     * Validate JSON nesting depth (max 64 levels)
     *
     * Only applicable for JSON encoding.
     *
     * @param data - The data object to validate
     * @param maxDepth - Maximum allowed nesting depth (default: 64)
     * @returns true if nesting depth is within limit
     *
     * @example
     * ```typescript
     * const data = { level1: { level2: { level3: 'value' } } }
     * if (StorageProgram.validateNestingDepth(data)) {
     *   // Safe nesting depth
     * }
     * ```
     */
    static validateNestingDepth(data: any, maxDepth: number = STORAGE_PROGRAM_CONSTANTS.MAX_JSON_NESTING_DEPTH): boolean {
        const getDepth = (obj: any, currentDepth: number = 1): number => {
            if (typeof obj !== "object" || obj === null) {
                return currentDepth
            }

            const depths = Object.values(obj).map(value =>
                getDepth(value, currentDepth + 1),
            )

            return Math.max(...depths, currentDepth)
        }

        return getDepth(data) <= maxDepth
    }

    // ========================================================================
    // ACL Helpers
    // ========================================================================

    /**
     * Check if an address has permission for an operation
     *
     * ACL Resolution Priority:
     * 1. Owner -> FULL ACCESS (always)
     * 2. Blacklisted -> DENIED (even if in allowed/groups)
     * 3. Allowed -> permissions granted
     * 4. Groups -> check group permissions
     * 5. Mode fallback: owner/restricted -> DENIED, public -> READ only
     *
     * @param acl - Access control configuration
     * @param ownerAddress - Owner address of the storage program
     * @param requestingAddress - Address requesting permission
     * @param permission - Permission type to check
     * @returns true if permission is granted
     *
     * @example
     * ```typescript
     * const acl = { mode: 'public', blacklisted: ['demos1spam...'] }
     * const canRead = StorageProgram.checkPermission(acl, owner, user, 'read')
     * ```
     */
    static checkPermission(
        acl: StorageProgramACL,
        ownerAddress: string,
        requestingAddress: string,
        permission: "read" | "write" | "delete",
    ): boolean {
        // 1. Owner always has full access
        if (requestingAddress === ownerAddress) return true

        // 2. Blacklisted addresses are always denied
        if (acl.blacklisted?.includes(requestingAddress)) return false

        // 3. Check allowed list (grants all permissions)
        if (acl.allowed?.includes(requestingAddress)) return true

        // 4. Check groups
        if (acl.groups) {
            for (const group of Object.values(acl.groups)) {
                if (group.members.includes(requestingAddress) && group.permissions.includes(permission)) {
                    return true
                }
            }
        }

        // 5. Fall back to mode
        switch (acl.mode) {
            case "public":
                return permission === "read" // Public allows read only
            case "owner":
            case "restricted":
            default:
                return false
        }
    }

    /**
     * Create a public ACL (anyone can read, owner writes)
     *
     * @returns StorageProgramACL configured for public read access
     *
     * @example
     * ```typescript
     * const acl = StorageProgram.publicACL()
     * // { mode: 'public' }
     * ```
     */
    static publicACL(): StorageProgramACL {
        return { mode: "public" }
    }

    /**
     * Create a private/owner-only ACL
     *
     * @returns StorageProgramACL configured for owner-only access
     *
     * @example
     * ```typescript
     * const acl = StorageProgram.privateACL()
     * // { mode: 'owner' }
     * ```
     */
    static privateACL(): StorageProgramACL {
        return { mode: "owner" }
    }

    /**
     * Create a restricted ACL with allowed addresses
     *
     * @param allowed - List of addresses allowed to access
     * @returns StorageProgramACL configured for restricted access
     *
     * @example
     * ```typescript
     * const acl = StorageProgram.restrictedACL(['demos1a...', 'demos1b...'])
     * // { mode: 'restricted', allowed: ['demos1a...', 'demos1b...'] }
     * ```
     */
    static restrictedACL(allowed: string[]): StorageProgramACL {
        return { mode: "restricted", allowed }
    }

    /**
     * Create a group-based ACL
     *
     * @param groups - Named groups with members and permissions
     * @returns StorageProgramACL configured for group-based access
     *
     * @example
     * ```typescript
     * const acl = StorageProgram.groupACL({
     *   admins: { members: ['demos1admin...'], permissions: ['read', 'write', 'delete'] },
     *   editors: { members: ['demos1ed1...', 'demos1ed2...'], permissions: ['read', 'write'] },
     *   viewers: { members: ['demos1view...'], permissions: ['read'] }
     * })
     * ```
     */
    static groupACL(groups: Record<string, StorageGroupPermissions>): StorageProgramACL {
        return { mode: "restricted", groups }
    }

    /**
     * Create an ACL with a blacklist
     *
     * @param mode - Base mode ('public' or 'restricted')
     * @param blacklisted - Addresses to block
     * @param allowed - Optional allowed addresses (for restricted mode)
     * @returns StorageProgramACL with blacklist configured
     *
     * @example
     * ```typescript
     * // Public but block spam addresses
     * const acl = StorageProgram.blacklistACL('public', ['demos1spam...'])
     * ```
     */
    static blacklistACL(
        mode: StorageACLMode,
        blacklisted: string[],
        allowed?: string[],
    ): StorageProgramACL {
        return { mode, blacklisted, allowed }
    }

    // ========================================================================
    // Legacy Compatibility Methods
    // ========================================================================

    /**
     * @deprecated Use createStorageProgram with acl parameter instead.
     * Kept for backward compatibility.
     *
     * Create a new Storage Program with legacy access control
     */
    static createStorageProgramLegacy(
        deployerAddress: string,
        programName: string,
        initialData: Record<string, any>,
        nonce: number,
        accessControl: StorageProgramAccessControl = "private",
        salt?: string,
        allowedAddresses?: string[],
    ): StorageProgramPayload {
        const storageAddress = this.deriveStorageAddress(
            deployerAddress,
            programName,
            nonce,
            salt || "",
        )

        return {
            operation: "CREATE_STORAGE_PROGRAM",
            storageAddress,
            programName,
            data: initialData,
            encoding: "json",
            accessControl,
            allowedAddresses,
            salt,
        }
    }

    /**
     * @deprecated Use updateAccessControl with acl parameter instead.
     * Kept for backward compatibility.
     *
     * Update access control with legacy mode
     */
    static updateAccessControlLegacy(
        storageAddress: string,
        accessControl: StorageProgramAccessControl,
        allowedAddresses?: string[],
    ): StorageProgramPayload {
        return {
            operation: "UPDATE_ACCESS_CONTROL",
            storageAddress,
            accessControl,
            allowedAddresses,
        }
    }

    // ========================================================================
    // Query Methods (RPC calls via nodeCall - no authentication required)
    // ========================================================================

    /**
     * Internal helper to make nodeCall RPC calls
     * nodeCall is used for public endpoints that don't require authentication
     */
    private static async nodeCall<T>(
        rpcUrl: string,
        message: string,
        data: Record<string, unknown>,
    ): Promise<{ result: number; response: T; extra?: unknown }> {
        const response = await axios.post<{ result: number; response: T; extra?: unknown }>(
            rpcUrl,
            {
                method: "nodeCall",
                params: [{ message, data, muid: `storage-${Date.now()}` }],
            },
            {
                headers: { "Content-Type": "application/json" },
            },
        )
        return response.data
    }

    /**
     * Get a storage program by address
     *
     * @param rpcUrl - The RPC endpoint URL (e.g., "https://node.demos.sh")
     * @param storageAddress - The storage program address (stor-{hash})
     * @param identity - Optional requester identity for ACL-protected programs
     * @returns Storage program data or null if not found
     *
     * @example
     * ```typescript
     * const program = await StorageProgram.getByAddress(
     *   'https://node.demos.sh',
     *   'stor-7a8b9c...'
     * )
     * if (program) {
     *   console.log(`Found: ${program.programName}`)
     * }
     * ```
     */
    static async getByAddress(
        rpcUrl: string,
        storageAddress: string,
        identity?: string,
    ): Promise<StorageProgramData | null> {
        try {
            const result = await this.nodeCall<StorageProgramData | null>(
                rpcUrl,
                "getStorageProgram",
                { storageAddress, requesterAddress: identity },
            )

            if (result.result !== 200 || !result.response) {
                return null
            }

            return result.response
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null
            }
            throw error
        }
    }

    /**
     * Get all storage programs owned by an address
     *
     * @param rpcUrl - The RPC endpoint URL
     * @param owner - The owner's address
     * @param identity - Optional requester identity for ACL filtering
     * @returns Array of storage program list items
     *
     * @example
     * ```typescript
     * const programs = await StorageProgram.getByOwner(
     *   'https://node.demos.sh',
     *   'demos1abc...'
     * )
     * console.log(`Found ${programs.length} programs`)
     * ```
     */
    static async getByOwner(
        rpcUrl: string,
        owner: string,
        identity?: string,
    ): Promise<StorageProgramListItem[]> {
        try {
            const result = await this.nodeCall<StorageProgramListItem[]>(
                rpcUrl,
                "getStorageProgramsByOwner",
                { owner, requesterAddress: identity },
            )

            if (result.result !== 200 || !result.response) {
                return []
            }

            return result.response
        } catch (error) {
            return []
        }
    }

    /**
     * Search storage programs by name (supports partial matching)
     *
     * @param rpcUrl - The RPC endpoint URL
     * @param nameQuery - The name or partial name to search for
     * @param options - Search options (exactMatch, limit, offset, identity)
     * @returns Array of storage program list items
     *
     * @example
     * ```typescript
     * // Partial match search
     * const results = await StorageProgram.searchByName(
     *   'https://node.demos.sh',
     *   'config'  // matches "appConfig", "myConfig", etc.
     * )
     *
     * // Exact match search
     * const exact = await StorageProgram.searchByName(
     *   'https://node.demos.sh',
     *   'myConfig',
     *   { exactMatch: true }
     * )
     *
     * // Paginated search
     * const page2 = await StorageProgram.searchByName(
     *   'https://node.demos.sh',
     *   'config',
     *   { limit: 10, offset: 10 }
     * )
     * ```
     */
    static async searchByName(
        rpcUrl: string,
        nameQuery: string,
        options?: {
            exactMatch?: boolean
            limit?: number
            offset?: number
            identity?: string
        },
    ): Promise<StorageProgramListItem[]> {
        try {
            const result = await this.nodeCall<StorageProgramListItem[]>(
                rpcUrl,
                "searchStoragePrograms",
                {
                    query: nameQuery,
                    options: {
                        limit: options?.limit,
                        offset: options?.offset,
                        exactMatch: options?.exactMatch,
                    },
                    requesterAddress: options?.identity,
                },
            )

            if (result.result !== 200 || !result.response) {
                return []
            }

            return result.response
        } catch (error) {
            return []
        }
    }
}
