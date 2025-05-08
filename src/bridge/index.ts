import { BridgeTradePayload } from "@/types/bridge/bridgeTradePayload"
import {
    ChainProviders,
    SupportedChains,
    SupportedTokens,
} from "@/types/bridge/constants"

export { BridgeTradePayload, ChainProviders, SupportedChains, SupportedTokens }

// Native bridge exports
import * as NativeBridgeTypes from "./nativeBridgeTypes"
import { methods as NativeBridgeMethods } from "./nativeBridge"

const NativeBridge = {
    types: NativeBridgeTypes,
    methods: NativeBridgeMethods,
}

export { NativeBridge }

