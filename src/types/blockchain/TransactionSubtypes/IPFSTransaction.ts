/**
 * IPFS Transaction Types
 *
 * Defines transaction types for IPFS operations on the Demos Network.
 * - IPFS_ADD: Upload content and auto-pin
 * - IPFS_PIN: Pin existing CID
 * - IPFS_UNPIN: Remove pin from account
 *
 * @fileoverview IPFS transaction type definitions for SDK
 */

import { Transaction, TransactionContent } from "../Transaction"
import { CustomCharges } from "../CustomCharges"

// ============================================================================
// IPFS Operation Types
// ============================================================================

/**
 * IPFS operation type constants
 */
export type IPFSOperationType = "IPFS_ADD" | "IPFS_PIN" | "IPFS_UNPIN"

// ============================================================================
// Payload Interfaces
// ============================================================================

/**
 * Payload for IPFS_ADD operation
 *
 * Uploads content to IPFS and automatically pins it to the sender's account.
 * Content is base64 encoded for JSON compatibility.
 */
export interface IPFSAddPayload {
    /** The IPFS operation type */
    operation: "IPFS_ADD"

    /** Base64-encoded content to upload */
    content: string

    /** Optional filename for the content */
    filename?: string

    /** Optional metadata to associate with the pin */
    metadata?: Record<string, unknown>

    // REVIEW: Phase 9 - Custom charges for cost control
    /** Optional custom charges configuration (from ipfsQuote) */
    custom_charges?: CustomCharges
}

/**
 * Payload for IPFS_PIN operation
 *
 * Pins an existing CID to the sender's account.
 * Used when content already exists on IPFS and user wants to ensure availability.
 */
export interface IPFSPinPayload {
    /** The IPFS operation type */
    operation: "IPFS_PIN"

    /** Content Identifier to pin */
    cid: string

    /** Optional duration in blocks (0 = indefinite) */
    duration?: number

    /** Optional metadata to associate with the pin */
    metadata?: Record<string, unknown>

    // REVIEW: Phase 9 - Custom charges for cost control
    /** Optional custom charges configuration (from ipfsQuote) */
    custom_charges?: CustomCharges
}

/**
 * Payload for IPFS_UNPIN operation
 *
 * Removes a pin from the sender's account.
 * Content may still exist on IPFS but sender no longer pays for hosting.
 */
export interface IPFSUnpinPayload {
    /** The IPFS operation type */
    operation: "IPFS_UNPIN"

    /** Content Identifier to unpin */
    cid: string
}

/**
 * Union type for all IPFS payloads
 */
export type IPFSPayload = IPFSAddPayload | IPFSPinPayload | IPFSUnpinPayload

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction content type for IPFS operations
 */
export type IPFSTransactionContent = Omit<TransactionContent, "type" | "data"> & {
    type: "ipfs"
    data: ["ipfs", IPFSPayload]
}

/**
 * Complete IPFS transaction interface
 */
export interface IPFSTransaction extends Omit<Transaction, "content"> {
    content: IPFSTransactionContent
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a payload is an IPFS_ADD operation
 */
export function isIPFSAddPayload(payload: IPFSPayload): payload is IPFSAddPayload {
    return payload.operation === "IPFS_ADD"
}

/**
 * Check if a payload is an IPFS_PIN operation
 */
export function isIPFSPinPayload(payload: IPFSPayload): payload is IPFSPinPayload {
    return payload.operation === "IPFS_PIN"
}

/**
 * Check if a payload is an IPFS_UNPIN operation
 */
export function isIPFSUnpinPayload(payload: IPFSPayload): payload is IPFSUnpinPayload {
    return payload.operation === "IPFS_UNPIN"
}

/**
 * Check if any payload is an IPFS payload
 */
export function isIPFSPayload(payload: unknown): payload is IPFSPayload {
    if (!payload || typeof payload !== "object") return false
    const p = payload as Record<string, unknown>
    return (
        p.operation === "IPFS_ADD" ||
        p.operation === "IPFS_PIN" ||
        p.operation === "IPFS_UNPIN"
    )
}
