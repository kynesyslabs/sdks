// Interface for the payload of the bridge
export interface BridgeTradePayload {
    fromToken: "NATIVE" | "USDC" | "USDT",
    toToken: "NATIVE" | "USDC" | "USDT",
    amount: number,
    fromChainId: number,
    toChainId: number,
}
