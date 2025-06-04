export { BridgeTradePayload } from "@/types/bridge/bridgeTradePayload"
export {
    ChainProviders,
    SupportedChains,
    SupportedTokens,
} from "@/types/bridge/constants"
import RubicBridge from "./rubicBridge"

import { methods as NativeBridgeMethods } from "./nativeBridge"
export { NativeBridgeMethods }

// Export types from nativeBridgeTypes
export {
    BridgeOperation as NativeBridgeOperation,
    BridgeOperationCompiled as NativeBridgeOperationCompiled,
    SupportedChain as NativeBridgeSupportedChain,
    SupportedStablecoin as NativeBridgeSupportedStablecoin,
    SupportedEVMChain as NativeBridgeSupportedEVMChain,
    supportedChains as NativeBridgeSupportedChains,
    supportedStablecoins as NativeBridgeSupportedStablecoins,
    supportedEVMChains as NativeBridgeSupportedEVMChains,
    usdcContracts as NativeBridgeUSDCContracts,
    usdcAbi as NativeBridgeUSDCAbi,
} from "./nativeBridgeTypes"
export { RubicBridge }
