// Interface for the payload of the Rubic-style cross-chain bridge.
//
// **NOT** DEM/OS-denominated. `amount`, `fromToken`, `toToken`, and the
// chain IDs all refer to a **foreign** chain pair (e.g. USDT on Polygon →
// USDT on Ethereum). `"NATIVE"` here means the foreign chain's native
// token (ETH on EVM, etc.), not Demos `DEM`. This payload is consumed by
// the Rubic backend, which expects the chain's own decimal convention.
//
// P4 widens `amount` to `number | string` only for BigInt-safe input on
// large foreign-chain values — semantics are unchanged and **no OS
// conversion** is applied to it.
export interface BridgeTradePayload {
    fromToken: "NATIVE" | "USDC" | "USDT",
    toToken: "NATIVE" | "USDC" | "USDT",
    amount: number | string,
    fromChainId: number,
    toChainId: number,
}
