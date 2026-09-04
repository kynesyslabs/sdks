/**
 * Minimal wire shape accepted by the Demos `execute_mock_trade` RPC.
 *
 * Keep this independent of the optional Rubic SDK: DACS consumers should not
 * acquire an optional dependency merely by resolving `websdk` declarations.
 */
export interface RubicTradeWirePayload {
    trade: object | null
    tradeType: string
    error?: unknown
}
