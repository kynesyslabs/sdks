/**
 * Custom Charges Types
 *
 * Defines types for variable-cost operations that require user consent
 * before execution. Used in the confirm/execute two-step transaction flow
 * to provide cost transparency.
 *
 * @fileoverview Custom charges type definitions for cost estimation
 */

// ============================================================================
// IPFS Custom Charges
// ============================================================================

/**
 * Cost breakdown for IPFS operations
 *
 * Provides detailed cost calculation components so users can understand
 * what they're paying for.
 */
export interface IPFSCostBreakdown {
    /** Base cost for the operation in DEM wei */
    base_cost: string

    /** Cost based on file size in DEM wei */
    size_cost: string

    /** Cost based on storage duration in DEM wei (optional for indefinite pins) */
    duration_cost?: string

    /** Any additional costs (network fees, etc.) */
    additional_costs?: Record<string, string>
}

/**
 * IPFS custom charges configuration
 *
 * Included in transaction content to specify maximum cost user agrees to pay.
 * Node will validate that actual cost does not exceed max_cost_dem.
 */
export interface IPFSCustomCharges {
    /** Maximum cost user is willing to pay (in DEM wei as string for BigInt safety) */
    max_cost_dem: string

    /** File size in bytes - used for cost calculation validation */
    file_size_bytes: number

    /** IPFS operation type */
    operation: "IPFS_ADD" | "IPFS_PIN" | "IPFS_UNPIN"

    /** Optional duration in blocks (for PIN operations) */
    duration_blocks?: number

    /** Optional cost breakdown from ipfsQuote (for reference) */
    estimated_breakdown?: IPFSCostBreakdown
}

// ============================================================================
// Generic Custom Charges Container
// ============================================================================

/**
 * Custom charges container for transaction content
 *
 * Extensible structure to support various operation types that require
 * cost estimation. Each field is optional and specific to operation type.
 *
 * @example
 * // IPFS operation with custom charges
 * const tx: TransactionContent = {
 *     type: "ipfs",
 *     // ... other fields
 *     custom_charges: {
 *         ipfs: {
 *             max_cost_dem: "1000000000000000000",
 *             file_size_bytes: 1024,
 *             operation: "IPFS_ADD"
 *         }
 *     }
 * }
 */
export interface CustomCharges {
    /** IPFS operation cost configuration */
    ipfs?: IPFSCustomCharges

    // Future extensibility:
    // compute?: ComputeCustomCharges
    // bandwidth?: BandwidthCustomCharges
    // storage?: StorageCustomCharges
}

// ============================================================================
// ValidityData Custom Charges Response
// ============================================================================

/**
 * Custom charges response in ValidityData
 *
 * Returned by confirmTx to show actual costs vs maximum user agreed to pay.
 * Allows user to review and abort if actual cost is higher than expected.
 */
export interface ValidityDataCustomCharges {
    /** Charge type identifier */
    type: "ipfs_storage" | "ipfs_bandwidth" | "compute" | string

    /** What user signed as maximum (from TX custom_charges) */
    max_cost_dem: string

    /** What node will actually charge (must be <= max_cost_dem) */
    actual_cost_dem: string

    /** Detailed breakdown of actual costs */
    breakdown: IPFSCostBreakdown
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if custom charges include IPFS configuration
 */
export function hasIPFSCustomCharges(
    charges: CustomCharges | undefined
): charges is CustomCharges & { ipfs: IPFSCustomCharges } {
    return charges?.ipfs !== undefined
}

/**
 * Validate that actual cost does not exceed maximum
 */
export function isValidCharge(
    maxCostDem: string,
    actualCostDem: string
): boolean {
    try {
        const max = BigInt(maxCostDem)
        const actual = BigInt(actualCostDem)
        return actual <= max
    } catch {
        return false
    }
}
