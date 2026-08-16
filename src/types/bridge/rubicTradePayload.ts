/**
 * Package-owned shape for a Rubic-style cross-chain trade transported through
 * the Demos bridge RPC. The optional `rubic-sdk` package exposes a richer class;
 * this deliberately captures only the stable fields used by the RPC boundary.
 */
export interface CrossChainTrade<_TransactionConfig = unknown> {
    readonly type: string
    readonly from: object
    readonly to: object
    readonly toTokenAmountMin?: unknown
    readonly feeInfo?: unknown
    readonly onChainSubtype?: unknown
    readonly bridgeType?: string
    readonly isAggregator?: boolean
}

/**
 * Package-owned wrapper accepted by `executeMockTrade`.
 *
 * Rubic's `WrappedCrossChainTrade` is structurally assignable to this type, but
 * consumers of the default SDK surface do not need the optional Rubic package
 * merely to resolve declarations.
 */
export interface WrappedCrossChainTrade {
    readonly trade: CrossChainTrade | null
    readonly tradeType: string
    readonly error?: unknown
}
