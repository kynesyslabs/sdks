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
import type {
    IPFSCustomCharges,
    IPFSCostBreakdown,
} from "../types/blockchain/CustomCharges"

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

// REVIEW: Phase 9 - Cost quote types for custom_charges flow

/**
 * Response from ipfsQuote nodeCall
 *
 * Provides cost estimation before transaction is built and signed.
 * Use this to populate custom_charges in the transaction.
 */
export interface IpfsQuoteResponse {
    /** Estimated cost in DEM (as string for BigInt safety) */
    cost_dem: string
    /** File size used for calculation */
    file_size_bytes: number
    /** Whether sender is a genesis account */
    is_genesis: boolean
    /** Detailed cost breakdown */
    breakdown: {
        /** Base cost component */
        base_cost: string
        /** Cost for file size */
        size_cost: string
        /** Bytes covered by free tier (genesis only) */
        free_tier_bytes: number
        /** Bytes that will be charged */
        chargeable_bytes: number
    }
    /** Operation quoted for */
    operation: string
}

/**
 * Extended add options with custom charges support
 */
export interface AddOptionsWithCharges extends AddOptions {
    /** Optional custom charges configuration for cost control */
    customCharges?: {
        /** Maximum cost user agrees to pay (from ipfsQuote response) */
        maxCostDem: string
        /** Optional cost breakdown for reference */
        estimatedBreakdown?: IPFSCostBreakdown
    }
}

/**
 * Extended pin options with custom charges support
 */
export interface PinOptionsWithCharges extends PinOptions {
    /** File size in bytes (required when using custom charges) */
    fileSize?: number
    /** Optional custom charges configuration for cost control */
    customCharges?: {
        /** Maximum cost user agrees to pay (from ipfsQuote response) */
        maxCostDem: string
        /** Optional cost breakdown for reference */
        estimatedBreakdown?: IPFSCostBreakdown
    }
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
     * @param options - Optional filename, metadata, and custom charges configuration
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
     *
     * // With custom charges (recommended for cost control)
     * const quote = await demos.ipfs.quote(content.length, 'IPFS_ADD')
     * const chargedPayload = IPFSOperations.createAddPayload(
     *   content,
     *   {
     *     filename: 'data.json',
     *     customCharges: { maxCostDem: quote.cost_dem }
     *   }
     * )
     * ```
     */
    static createAddPayload(
        content: Buffer | Uint8Array | string,
        options: AddOptionsWithCharges = {},
    ): IPFSAddPayload {
        // Convert content to base64
        let base64Content: string
        let contentSize: number

        if (typeof content === "string") {
            base64Content = Buffer.from(content).toString("base64")
            contentSize = Buffer.byteLength(content)
        } else {
            // Both Buffer and Uint8Array can be converted via Buffer.from
            base64Content = Buffer.from(content).toString("base64")
            contentSize = content.length
        }

        const payload: IPFSAddPayload = {
            operation: "IPFS_ADD",
            content: base64Content,
            filename: options.filename,
            metadata: options.metadata,
        }

        // REVIEW: Phase 9 - Add custom_charges if provided
        if (options.customCharges?.maxCostDem) {
            payload.custom_charges = {
                ipfs: {
                    max_cost_dem: options.customCharges.maxCostDem,
                    file_size_bytes: contentSize,
                    operation: "IPFS_ADD",
                    estimated_breakdown: options.customCharges.estimatedBreakdown,
                },
            }
        }

        return payload
    }

    /**
     * Create a payload for IPFS_PIN operation
     *
     * Pins an existing CID to the sender's account.
     *
     * @param cid - Content Identifier to pin
     * @param options - Optional duration, metadata, fileSize, and custom charges
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
     *
     * // Pin with custom charges (recommended for cost control)
     * const quote = await demos.ipfs.quote(fileSize, 'IPFS_PIN')
     * const chargedPayload = IPFSOperations.createPinPayload('QmExample...', {
     *   fileSize: 1024,
     *   customCharges: { maxCostDem: quote.cost_dem }
     * })
     * ```
     */
    static createPinPayload(
        cid: string,
        options: PinOptionsWithCharges = {},
    ): IPFSPinPayload {
        // Validate CID format
        if (!this.isValidCID(cid)) {
            throw new Error(`Invalid CID format: ${cid}`)
        }

        const payload: IPFSPinPayload = {
            operation: "IPFS_PIN",
            cid,
            duration: options.duration,
            metadata: options.metadata,
        }

        // REVIEW: Phase 9 - Add custom_charges if provided
        if (options.customCharges?.maxCostDem && options.fileSize !== undefined) {
            payload.custom_charges = {
                ipfs: {
                    max_cost_dem: options.customCharges.maxCostDem,
                    file_size_bytes: options.fileSize,
                    operation: "IPFS_PIN",
                    duration_blocks: options.duration,
                    estimated_breakdown: options.customCharges.estimatedBreakdown,
                },
            }
        }

        return payload
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

    // ========================================================================
    // REVIEW: Phase 9 - Custom Charges Utilities
    // ========================================================================

    /**
     * Convert an ipfsQuote response to custom charges configuration
     *
     * Convenience method for converting quote response to the format expected
     * by createAddPayload and createPinPayload options.
     *
     * @param quote - Response from ipfsQuote nodeCall
     * @returns Custom charges configuration for payload options
     *
     * @example
     * ```typescript
     * // Get quote from node
     * const quote = await demos.ipfs.quote(content.length, 'IPFS_ADD')
     *
     * // Convert to custom charges options
     * const customCharges = IPFSOperations.quoteToCustomCharges(quote)
     *
     * // Use in payload creation
     * const payload = IPFSOperations.createAddPayload(content, {
     *   filename: 'data.json',
     *   customCharges
     * })
     * ```
     */
    static quoteToCustomCharges(quote: IpfsQuoteResponse): {
        maxCostDem: string
        estimatedBreakdown: IPFSCostBreakdown
    } {
        return {
            maxCostDem: quote.cost_dem,
            estimatedBreakdown: {
                base_cost: quote.breakdown.base_cost,
                size_cost: quote.breakdown.size_cost,
            },
        }
    }

    /**
     * Create IPFSCustomCharges object from quote response
     *
     * Creates a fully formed custom charges object suitable for including
     * directly in transaction content.
     *
     * @param quote - Response from ipfsQuote nodeCall
     * @param operation - IPFS operation type
     * @param durationBlocks - Optional duration for PIN operations
     * @returns IPFSCustomCharges object
     *
     * @example
     * ```typescript
     * const quote = await demos.ipfs.quote(fileSize, 'IPFS_PIN')
     * const charges = IPFSOperations.createCustomCharges(quote, 'IPFS_PIN', 1000000)
     *
     * // Include in transaction content
     * tx.content.custom_charges = { ipfs: charges }
     * ```
     */
    static createCustomCharges(
        quote: IpfsQuoteResponse,
        operation: "IPFS_ADD" | "IPFS_PIN" | "IPFS_UNPIN",
        durationBlocks?: number,
    ): IPFSCustomCharges {
        return {
            max_cost_dem: quote.cost_dem,
            file_size_bytes: quote.file_size_bytes,
            operation,
            duration_blocks: durationBlocks,
            estimated_breakdown: {
                base_cost: quote.breakdown.base_cost,
                size_cost: quote.breakdown.size_cost,
            },
        }
    }
}
