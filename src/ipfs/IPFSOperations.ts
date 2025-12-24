/**
 * IPFS Operations for Demos Network SDK
 *
 * Provides payload creators for IPFS transactions and helper utilities.
 * Works with the Demos transaction system for add, pin, and unpin operations.
 *
 * @fileoverview IPFS operations module for SDK
 *
 * @example
 * ```typescript
 * import { ipfs } from '@kynesyslabs/demosdk'
 *
 * // Create add payload for transaction
 * const addPayload = ipfs.IPFSOperations.createAddPayload(
 *   Buffer.from('Hello IPFS!'),
 *   'hello.txt'
 * )
 *
 * // Create pin payload for existing CID
 * const pinPayload = ipfs.IPFSOperations.createPinPayload(
 *   'QmExampleCID...'
 * )
 *
 * // Create unpin payload
 * const unpinPayload = ipfs.IPFSOperations.createUnpinPayload(
 *   'QmExampleCID...'
 * )
 * ```
 */

import type {
    IPFSAddPayload,
    IPFSPinPayload,
    IPFSUnpinPayload,
    IPFSPayload,
} from "../types/blockchain/TransactionSubtypes/IPFSTransaction"

// REVIEW: IPFS Operations class for Demos Network SDK

// ============================================================================
// Constants
// ============================================================================

/**
 * IPFS configuration constants
 */
export const IPFS_CONSTANTS = {
    /** Maximum content size for direct upload (1GB) */
    MAX_CONTENT_SIZE: 1024 * 1024 * 1024,

    /** CIDv0 pattern (Qm followed by base58 characters) */
    CID_V0_PATTERN: /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/,

    /** CIDv1 patterns (bafy or bafk prefix with base32 characters) */
    CID_V1_PATTERN: /^(bafy|bafk|bafz|bafb)[a-z2-7]{50,}$/i,
} as const

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the add operation
 */
export interface AddOptions {
    /** Optional filename for the content */
    filename?: string
    /** Optional metadata to associate with the pin */
    metadata?: Record<string, unknown>
}

/**
 * Options for the pin operation
 */
export interface PinOptions {
    /** Duration in blocks (0 = indefinite) */
    duration?: number
    /** Optional metadata to associate with the pin */
    metadata?: Record<string, unknown>
}

/**
 * Response from IPFS status query
 */
export interface IPFSStatusResponse {
    healthy: boolean
    peerId?: string
    peerCount?: number
    timestamp: number
    error?: string
}

/**
 * Response from IPFS add operation
 */
export interface IPFSAddResponse {
    success: boolean
    cid?: string
    size?: number
    error?: string
}

/**
 * Response from IPFS get operation
 */
export interface IPFSGetResponse {
    success: boolean
    cid: string
    content?: string
    size?: number
    base64: boolean
    error?: string
}

/**
 * Pin information from account state
 */
export interface PinInfo {
    cid: string
    size: number
    timestamp: number
    expiresAt?: number
    metadata?: Record<string, unknown>
    wasFree?: boolean
    freeBytes?: number
    costPaid?: string
}

/**
 * Response from pins query
 */
export interface IPFSPinsResponse {
    success: boolean
    address: string
    pins: PinInfo[]
    count: number
    totalPinnedBytes: number
    earnedRewards: string
    paidCosts: string
    error?: string
}

// ============================================================================
// Main Class
// ============================================================================

/**
 * IPFS Operations class for creating payloads and utility functions
 *
 * This class provides static methods to create transaction payloads for IPFS operations.
 * The payloads can be used with the Demos transaction system.
 *
 * @example
 * ```typescript
 * import { ipfs, websdk } from '@kynesyslabs/demosdk'
 *
 * // Initialize Demos client
 * const demos = new websdk.Demos({ rpcUrl: 'https://rpc.demos.network' })
 *
 * // Create add payload
 * const addPayload = ipfs.IPFSOperations.createAddPayload(
 *   Buffer.from('My content'),
 *   'myfile.txt'
 * )
 *
 * // Build and send transaction (pseudocode - actual tx flow depends on integration)
 * // The payload goes in transaction.content.data as ['ipfs', payload]
 * ```
 */
export class IPFSOperations {
    // ========================================================================
    // Payload Creators (for transactions)
    // ========================================================================

    /**
     * Create a payload for IPFS_ADD operation
     *
     * Uploads content to IPFS and automatically pins it to the sender's account.
     *
     * @param content - Content to upload (Buffer, Uint8Array, or string)
     * @param options - Optional filename and metadata
     * @returns IPFSAddPayload for transaction creation
     *
     * @example
     * ```typescript
     * // Simple text upload
     * const payload = IPFSOperations.createAddPayload(
     *   'Hello, IPFS!',
     *   { filename: 'hello.txt' }
     * )
     *
     * // Binary content
     * const imageBuffer = fs.readFileSync('image.png')
     * const imagePayload = IPFSOperations.createAddPayload(
     *   imageBuffer,
     *   { filename: 'image.png', metadata: { type: 'image/png' } }
     * )
     * ```
     */
    static createAddPayload(
        content: Buffer | Uint8Array | string,
        options: AddOptions = {},
    ): IPFSAddPayload {
        // Convert content to base64
        let base64Content: string
        if (typeof content === "string") {
            base64Content = Buffer.from(content).toString("base64")
        } else {
            // Both Buffer and Uint8Array can be converted via Buffer.from
            base64Content = Buffer.from(content).toString("base64")
        }

        return {
            operation: "IPFS_ADD",
            content: base64Content,
            filename: options.filename,
            metadata: options.metadata,
        }
    }

    /**
     * Create a payload for IPFS_PIN operation
     *
     * Pins an existing CID to the sender's account.
     *
     * @param cid - Content Identifier to pin
     * @param options - Optional duration and metadata
     * @returns IPFSPinPayload for transaction creation
     *
     * @example
     * ```typescript
     * // Pin indefinitely
     * const payload = IPFSOperations.createPinPayload('QmExample...')
     *
     * // Pin with duration (blocks)
     * const timedPayload = IPFSOperations.createPinPayload('QmExample...', {
     *   duration: 1000000, // ~30 days at 2.5s blocks
     *   metadata: { source: 'user-upload' }
     * })
     * ```
     */
    static createPinPayload(
        cid: string,
        options: PinOptions = {},
    ): IPFSPinPayload {
        // Validate CID format
        if (!this.isValidCID(cid)) {
            throw new Error(`Invalid CID format: ${cid}`)
        }

        return {
            operation: "IPFS_PIN",
            cid,
            duration: options.duration,
            metadata: options.metadata,
        }
    }

    /**
     * Create a payload for IPFS_UNPIN operation
     *
     * Removes a pin from the sender's account.
     *
     * @param cid - Content Identifier to unpin
     * @returns IPFSUnpinPayload for transaction creation
     *
     * @example
     * ```typescript
     * const payload = IPFSOperations.createUnpinPayload('QmExample...')
     * ```
     */
    static createUnpinPayload(cid: string): IPFSUnpinPayload {
        // Validate CID format
        if (!this.isValidCID(cid)) {
            throw new Error(`Invalid CID format: ${cid}`)
        }

        return {
            operation: "IPFS_UNPIN",
            cid,
        }
    }

    // ========================================================================
    // Validation Utilities
    // ========================================================================

    /**
     * Validate a CID format
     *
     * Supports both CIDv0 (Qm...) and CIDv1 (bafy.../bafk...) formats.
     *
     * @param cid - Content Identifier to validate
     * @returns true if CID is valid format
     *
     * @example
     * ```typescript
     * IPFSOperations.isValidCID('QmExample...') // true for valid CIDv0
     * IPFSOperations.isValidCID('bafyExample...') // true for valid CIDv1
     * IPFSOperations.isValidCID('invalid') // false
     * ```
     */
    static isValidCID(cid: string): boolean {
        if (!cid || typeof cid !== "string") {
            return false
        }

        return (
            IPFS_CONSTANTS.CID_V0_PATTERN.test(cid) ||
            IPFS_CONSTANTS.CID_V1_PATTERN.test(cid)
        )
    }

    /**
     * Validate content size
     *
     * @param content - Content to validate
     * @returns true if content size is within limit
     *
     * @example
     * ```typescript
     * const largeBuffer = Buffer.alloc(2 * 1024 * 1024 * 1024) // 2GB
     * IPFSOperations.isValidContentSize(largeBuffer) // false
     * ```
     */
    static isValidContentSize(content: Buffer | Uint8Array | string): boolean {
        let size: number
        if (typeof content === "string") {
            size = Buffer.byteLength(content)
        } else {
            size = content.length
        }

        return size <= IPFS_CONSTANTS.MAX_CONTENT_SIZE
    }

    /**
     * Get content size in bytes
     *
     * @param content - Content to measure
     * @returns Size in bytes
     */
    static getContentSize(content: Buffer | Uint8Array | string): number {
        if (typeof content === "string") {
            return Buffer.byteLength(content)
        }
        return content.length
    }

    // ========================================================================
    // Content Encoding Utilities
    // ========================================================================

    /**
     * Encode content to base64
     *
     * @param content - Content to encode
     * @returns Base64 encoded string
     */
    static encodeContent(content: Buffer | Uint8Array | string): string {
        if (typeof content === "string") {
            return Buffer.from(content).toString("base64")
        }
        // Both Buffer and Uint8Array can be converted via Buffer.from
        return Buffer.from(content).toString("base64")
    }

    /**
     * Decode base64 content to Buffer
     *
     * @param base64Content - Base64 encoded content
     * @returns Decoded Buffer
     */
    static decodeContent(base64Content: string): Buffer {
        return Buffer.from(base64Content, "base64")
    }

    /**
     * Decode base64 content to string
     *
     * @param base64Content - Base64 encoded content
     * @param encoding - Text encoding (default: 'utf-8')
     * @returns Decoded string
     */
    static decodeContentAsString(
        base64Content: string,
        encoding: BufferEncoding = "utf-8",
    ): string {
        return Buffer.from(base64Content, "base64").toString(encoding)
    }

    // ========================================================================
    // Type Guards
    // ========================================================================

    /**
     * Check if payload is an add operation
     */
    static isAddPayload(payload: IPFSPayload): payload is IPFSAddPayload {
        return payload.operation === "IPFS_ADD"
    }

    /**
     * Check if payload is a pin operation
     */
    static isPinPayload(payload: IPFSPayload): payload is IPFSPinPayload {
        return payload.operation === "IPFS_PIN"
    }

    /**
     * Check if payload is an unpin operation
     */
    static isUnpinPayload(payload: IPFSPayload): payload is IPFSUnpinPayload {
        return payload.operation === "IPFS_UNPIN"
    }
}
