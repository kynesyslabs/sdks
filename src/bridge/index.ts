import { BridgeTradePayload } from "@/types/bridge/bridgeTradePayload"
import {
    ChainProviders,
    SupportedChains,
    SupportedTokens,
} from "@/types/bridge/constants"

export { BridgeTradePayload, ChainProviders, SupportedChains, SupportedTokens }

import { methods as NativeBridgeMethods } from "./nativeBridge"
export { NativeBridgeMethods }

// Export types from nativeBridgeTypes
export {
    BridgeOperation as NativeBridgeOperation,
    NativeBridgePayload,
    SupportedChain as NativeBridgeSupportedChain,
    SupportedStablecoin as NativeBridgeSupportedStablecoin,
    SupportedEVMChain as NativeBridgeSupportedEVMChain,
    supportedChains as NativeBridgeSupportedChains,
    supportedStablecoins as NativeBridgeSupportedStablecoins,
    supportedEVMChains as NativeBridgeSupportedEVMChains,
    usdcContracts as NativeBridgeUSDCContracts,
    usdcAbi as NativeBridgeUSDCAbi,
} from "./nativeBridgeTypes"
