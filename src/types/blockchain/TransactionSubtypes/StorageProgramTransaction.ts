import { Transaction, TransactionContent } from "../Transaction"

// REVIEW: Storage Program transaction types for key-value storage with access control

/**
 * Storage Program operations
 *
 * - CREATE_STORAGE_PROGRAM: Initialize a new storage program with access control
 * - WRITE_STORAGE: Write/update key-value pairs in the storage
 * - READ_STORAGE: Query operation (not a transaction, used for validation)
 * - UPDATE_ACCESS_CONTROL: Modify access control settings (deployer only)
 * - DELETE_STORAGE_PROGRAM: Remove the entire storage program (deployer only)
 */
export type StorageProgramOperation =
    | "CREATE_STORAGE_PROGRAM"
    | "WRITE_STORAGE"
    | "READ_STORAGE"
    | "UPDATE_ACCESS_CONTROL"
    | "DELETE_STORAGE_PROGRAM"

/**
 * Access control modes for Storage Programs
 *
 * - private: Only deployer can read and write
 * - public: Anyone can read, only deployer can write
 * - restricted: Only addresses in allowedAddresses can read/write
 * - deployer-only: Only deployer has all permissions (same as private but explicit)
 */
export type StorageProgramAccessControl = "private" | "public" | "restricted" | "deployer-only"

/**
 * Storage Program payload for transaction data
 *
 * @property operation - The storage operation to perform
 * @property storageAddress - The storage program address (stor-{hash})
 * @property programName - Name of the storage program (required for CREATE)
 * @property data - Key-value data to write (required for CREATE and WRITE)
 * @property accessControl - Access control mode (optional for CREATE, required for UPDATE_ACCESS_CONTROL)
 * @property allowedAddresses - List of allowed addresses for 'restricted' mode
 * @property salt - Random salt for address derivation (optional for CREATE)
 */
export interface StorageProgramPayload {
    /** The storage operation to perform */
    operation: StorageProgramOperation
    /** The storage program address (stor-{hash format}) */
    storageAddress: string
    /** Name of the storage program (required for CREATE_STORAGE_PROGRAM) */
    programName?: string
    /** Key-value data to write (for CREATE_STORAGE_PROGRAM and WRITE_STORAGE) */
    data?: Record<string, any>
    /** Access control mode */
    accessControl?: StorageProgramAccessControl
    /** Allowed addresses for 'restricted' access control */
    allowedAddresses?: string[]
    /** Random salt for deterministic address derivation (optional) */
    salt?: string
}

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
 * Used for structured key-value storage on the blockchain with access control.
 *
 * Storage Programs support:
 * - Key-value storage (max 128KB per program)
 * - Access control (private, public, restricted, deployer-only)
 * - Deterministic address derivation
 * - Nested data structures (max 64 levels)
 *
 * @see STORAGE_PROGRAMS_SPEC.md for complete specification
 */
export interface StorageProgramTransaction extends Omit<Transaction, "content"> {
    content: StorageProgramTransactionContent
}
