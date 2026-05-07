/**
 * Fork-detection types and the sub-DEM precision error.
 *
 * Shape mirrors the node's `libs/network/handlers/forkHandlers.ts`
 * response — this is the wire contract for the `getNetworkInfo`
 * `nodeCall`. Wrapping the per-fork status under `forks.<name>` makes
 * adding a future fork a strictly additive change.
 *
 * @module denomination/networkInfo
 */

// REVIEW: P4 commit 3 — wire-format types for fork detection. Kept
// alongside the denomination module so the SDK has a single co-located
// source of truth for everything that reads OS-vs-DEM semantics.

/** Per-fork status entry. */
export interface ForkStatus {
    /**
     * Configured activation height for the fork. `null` means the fork
     * is configured but unscheduled (the SDK should treat this as
     * "fork will not activate during this RPC's lifetime").
     */
    activationHeight: number | null
    /**
     * Whether the fork's rules are currently active on the node.
     * Computed by the canonical `isForkActive` gate node-side; the SDK
     * uses this directly without recomputing.
     */
    activated: boolean
    /**
     * In-memory cache of the latest block height the node has
     * processed. Lets clients do their own near-fork detection without
     * an extra `getLastBlockNumber` call.
     */
    currentHeight: number
}

/**
 * Response shape for the `getNetworkInfo` `nodeCall`.
 *
 * The SDK only consults `forks.osDenomination.activated` for serializer
 * routing; the rest of the payload is exposed for callers that want to
 * surface near-fork warnings to their users.
 */
export interface NetworkInfo {
    forks: {
        osDenomination: ForkStatus
    }
}

/**
 * Thrown by `Demos.transfer` (and friends) when a caller passes an OS
 * amount with sub-DEM precision against a node that has not yet
 * activated the `osDenomination` fork. The pre-fork wire shape is a JS
 * `number` in DEM, which cannot represent sub-DEM precision; sending
 * the transaction would silently truncate the user's funds. This guard
 * fails fast at the public-API boundary before any signing happens.
 *
 * @example
 * ```ts
 * try {
 *   await demos.transfer(to, 1_234_567n) // sub-DEM precision
 * } catch (err) {
 *   if (err instanceof SubDemPrecisionError) {
 *     // tell the user to round, or to upgrade the node
 *   }
 * }
 * ```
 */
export class SubDemPrecisionError extends Error {
    /** Full OS amount the caller attempted to send. */
    readonly amountOs: bigint
    /** Truncated remainder: `amountOs % OS_PER_DEM`. */
    readonly subDemRemainderOs: bigint

    constructor(amountOs: bigint, subDemRemainderOs: bigint) {
        super(
            `Cannot send amount ${amountOs} OS to a pre-fork node: sub-DEM precision (${subDemRemainderOs} OS) would be silently truncated. The target node must upgrade to support OS-denomination before this transaction can be sent.`,
        )
        this.name = "SubDemPrecisionError"
        this.amountOs = amountOs
        this.subDemRemainderOs = subDemRemainderOs
    }
}
