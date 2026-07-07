export { BridgeTradePayload } from "@/types/bridge/bridgeTradePayload"
export {
    ChainProviders,
    SupportedChains,
    SupportedTokens,
} from "@/types/bridge/constants"
import RubicBridge from "./rubicBridge"
// Rubic value enums/errors (BLOCKCHAIN_NAME, CROSS_CHAIN_TRADE_TYPE, RubicSdkError)
// now live behind the optional `@kynesyslabs/demosdk/bridge/rubic` subpath, so
// importing this barrel (or `websdk`) never eagerly loads `rubic-sdk` — whose
// unresolvable peer-dep tree broke clean installs. The types stay here via
// `export type` (erased at build time — no runtime pull).
export type { CrossChainTrade, WrappedCrossChainTrade } from "rubic-sdk"

import { methods as NativeBridgeMethods } from "./nativeBridge"
import { supportedEVMChains, supportedNonEVMChains } from "./nativeBridgeTypes"
export { NativeBridgeMethods }

// Export types from nativeBridgeTypes
export {
    BridgeOperation as NativeBridgeOperation,
    BridgeOperationCompiled as NativeBridgeOperationCompiled,
    BridgeOperationCompiledLegacy as NativeBridgeOperationCompiledLegacy,
    CompiledContent,
    EVMTankData,
    SolanaTankData,
    NativeBridgeTxPayload,
    SupportedChain as NativeBridgeSupportedChain,
    SupportedStablecoin as NativeBridgeSupportedStablecoin,
    SupportedEVMChain as NativeBridgeSupportedEVMChain,
    supportedChains as NativeBridgeSupportedChains,
    supportedStablecoins as NativeBridgeSupportedStablecoins,
    supportedEVMChains as NativeBridgeSupportedEVMChains,
    usdcContracts as NativeBridgeUSDCContracts,
    usdcAbi as NativeBridgeUSDCAbi,
    supportedEVMChains,
    supportedNonEVMChains,
} from "./nativeBridgeTypes"
export { RubicBridge }

// Export standalone validateChain function
export function validateChain(chain: string, isOrigin: boolean): void {
    // Determine chain type based on supported chains
    let chainType: string
    if (supportedEVMChains.includes(chain as any)) {
        chainType = "EVM"
    } else if (supportedNonEVMChains.includes(chain as any)) {
        chainType = "SOLANA"
    } else {
        const chainTypeStr = isOrigin ? "origin" : "destination"
        throw new Error(`Invalid ${chainTypeStr} chain: ${chain} is not supported`)
    }

    // Use the bridge's validation method directly
    NativeBridgeMethods.validateChain(chain, chainType, isOrigin)
}