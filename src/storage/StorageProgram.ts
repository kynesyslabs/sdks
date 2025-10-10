import { createHash } from "crypto"
import type {
    StorageProgramPayload,
    StorageProgramAccessControl,
    StorageProgramOperation,
} from "../types/blockchain/TransactionSubtypes/StorageProgramTransaction"

// REVIEW: Storage Program class for key-value storage with access control

/**
 * Storage Program class for creating and managing key-value storage on Demos Network
 *
 * Features:
 * - Deterministic address derivation (stor-{sha256})
 * - Key-value storage with 128KB limit
 * - Access control (private, public, restricted, deployer-only)
 * - Nested data structures (max 64 levels)
 *
 * @example
 * ```typescript
 * import { StorageProgram } from '@kynesyslabs/demosdk'
 *
 * // Derive storage address
 * const address = StorageProgram.deriveStorageAddress(
 *   'myDeployerAddress',
 *   'myAppConfig',
 *   'randomSalt123'
 * )
 *
 * // Create storage program
 * const payload = StorageProgram.createStorageProgram(
 *   'myDeployerAddress',
 *   'myAppConfig',
 *   { apiKey: 'secret', endpoint: 'https://api.example.com' },
 *   'public',
 *   'randomSalt123'
 * )
 * ```
 */
export class StorageProgram {
    /**
     * Derive a deterministic storage program address
     *
     * @param deployerAddress - Address of the program deployer
     * @param programName - Name of the storage program
     * @param salt - Optional random salt for uniqueness (default: empty string)
     * @returns Storage address in format: stor-{first 40 chars of sha256}
     *
     * @example
     * ```typescript
     * const address = StorageProgram.deriveStorageAddress(
     *   'demos1abc...',
     *   'myConfig',
     *   'salt123'
     * )
     * // Returns: 'stor-7a8b9c...' (40 chars after prefix)
     * ```
     */
    static deriveStorageAddress(
        deployerAddress: string,
        programName: string,
        salt: string = "",
    ): string {
        // Create hash input: deployerAddress:programName:salt
        const hashInput = `${deployerAddress}:${programName}:${salt}`

        // SHA-256 hash and take first 40 characters
        const hash = createHash("sha256").update(hashInput).digest("hex")
        const addressHash = hash.substring(0, 40)

        return `stor-${addressHash}`
    }

    /**
     * Create a new Storage Program
     *
     * @param deployerAddress - Address creating the storage program (will be the deployer)
     * @param programName - Name of the storage program
     * @param initialData - Initial key-value data to store
     * @param accessControl - Access control mode (default: 'private')
     * @param salt - Optional random salt for address derivation
     * @param allowedAddresses - List of allowed addresses (for 'restricted' mode)
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * const payload = StorageProgram.createStorageProgram(
     *   'demos1abc...',
     *   'userPreferences',
     *   { theme: 'dark', language: 'en' },
     *   'private'
     * )
     * ```
     */
    static createStorageProgram(
        deployerAddress: string,
        programName: string,
        initialData: Record<string, any>,
        accessControl: StorageProgramAccessControl = "private",
        salt?: string,
        allowedAddresses?: string[],
    ): StorageProgramPayload {
        // Derive storage address
        const storageAddress = this.deriveStorageAddress(
            deployerAddress,
            programName,
            salt || "",
        )

        return {
            operation: "CREATE_STORAGE_PROGRAM",
            storageAddress,
            programName,
            data: initialData,
            accessControl,
            allowedAddresses,
            salt,
        }
    }

    /**
     * Write or update key-value data in a Storage Program
     *
     * @param storageAddress - The storage program address (stor-{hash})
     * @param data - Key-value data to write/update
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * const payload = StorageProgram.writeStorage(
     *   'stor-7a8b9c...',
     *   { newKey: 'value', existingKey: 'updatedValue' }
     * )
     * ```
     */
    static writeStorage(
        storageAddress: string,
        data: Record<string, any>,
    ): StorageProgramPayload {
        return {
            operation: "WRITE_STORAGE",
            storageAddress,
            data,
        }
    }

    /**
     * Read data from a Storage Program (query operation, not a transaction)
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
     * Update access control settings for a Storage Program (deployer only)
     *
     * @param storageAddress - The storage program address
     * @param accessControl - New access control mode
     * @param allowedAddresses - Updated list of allowed addresses (for 'restricted' mode)
     * @returns StorageProgramPayload for transaction creation
     *
     * @example
     * ```typescript
     * // Change from private to public
     * const payload = StorageProgram.updateAccessControl(
     *   'stor-7a8b9c...',
     *   'public'
     * )
     *
     * // Set restricted access with allowlist
     * const payload = StorageProgram.updateAccessControl(
     *   'stor-7a8b9c...',
     *   'restricted',
     *   ['demos1user1...', 'demos1user2...']
     * )
     * ```
     */
    static updateAccessControl(
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

    /**
     * Delete an entire Storage Program (deployer only)
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

    /**
     * Validate storage size against 128KB limit
     *
     * @param data - The data object to validate
     * @returns true if size is within limit, false otherwise
     *
     * @example
     * ```typescript
     * const data = { key: 'value', nested: { data: 'here' } }
     * if (StorageProgram.validateSize(data)) {
     *   // Safe to store
     * }
     * ```
     */
    static validateSize(data: Record<string, any>): boolean {
        const jsonString = JSON.stringify(data)
        const sizeInBytes = new TextEncoder().encode(jsonString).length
        const maxSizeInBytes = 128 * 1024 // 128KB

        return sizeInBytes <= maxSizeInBytes
    }

    /**
     * Get the size of data in bytes
     *
     * @param data - The data object to measure
     * @returns Size in bytes
     *
     * @example
     * ```typescript
     * const size = StorageProgram.getDataSize({ key: 'value' })
     * console.log(`Data size: ${size} bytes`)
     * ```
     */
    static getDataSize(data: Record<string, any>): number {
        const jsonString = JSON.stringify(data)
        return new TextEncoder().encode(jsonString).length
    }

    /**
     * Validate nesting depth (max 64 levels)
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
    static validateNestingDepth(data: any, maxDepth: number = 64): boolean {
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
}
