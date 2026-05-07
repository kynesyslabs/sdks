/**
 * Custom Charges Types
 *
 * Defines types for variable-cost operations that require user consent
 * before execution. Used in the confirm/execute two-step transaction flow
 * to provide cost transparency.
 *
 * @fileoverview Custom charges type definitions for cost estimation.
 *
 * P4 denomination migration:
 *   All cost fields are bigint-as-decimal-`string` in **OS** (smallest
 *   unit, 1 DEM = 10^9 OS). Field names changed from `*_dem` to `*_os` to
 *   reflect the new denomination. Pre-fork-compatible bridges should
 *   serialise these via the SDK's `serializerGate`, which converts to
 *   the legacy DEM-`number` shape for pre-fork nodes.
 */

// ============================================================================
// IPFS Custom Charges
// ============================================================================

/**
 * Cost breakdown for IPFS operations
 *
 * Provides detailed cost calculation components so users can understand
 * what they're paying for. All values are decimal-string OS amounts.
 */
export interface IPFSCostBreakdown {
    /** Base cost for the operation, decimal-string OS. */
    base_cost: string

    /** Cost based on file size, decimal-string OS. */
    size_cost: string

    /** Cost based on storage duration, decimal-string OS (optional for indefinite pins). */
    duration_cost?: string

    /** Any additional costs (network fees, etc.) — decimal-string OS values. */
    additional_costs?: Record<string, string>
}

/**
 * IPFS custom charges configuration
 *
 * Included in transaction content to specify maximum cost user agrees to pay.
 * Node will validate that actual cost does not exceed `max_cost_os`.
 */
export interface IPFSCustomCharges {
    /** Maximum cost user is willing to pay, decimal-string OS (BigInt-safe). */
    max_cost_os: string

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
 *             max_cost_os: "1000000000",  // 1 DEM in OS
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
 *
 * All cost fields are decimal-string OS.
 */
export interface ValidityDataCustomCharges {
    /** Charge type identifier */
    type: "ipfs_storage" | "ipfs_bandwidth" | "compute" | string

    /** What user signed as maximum (from TX `custom_charges`), decimal-string OS. */
    max_cost_os: string

    /** What node will actually charge (must be `<= max_cost_os`), decimal-string OS. */
    actual_cost_os: string

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
 * Validate that actual cost does not exceed maximum.
 *
 * Inputs are decimal-string OS amounts; both must parse cleanly as
 * non-negative bigints.
 */
export function isValidCharge(
    maxCostOs: string,
    actualCostOs: string
): boolean {
    try {
        const max = BigInt(maxCostOs)
        const actual = BigInt(actualCostOs)
        return actual <= max
    } catch {
        return false
    }
}
