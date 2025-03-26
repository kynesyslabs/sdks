import { RPCResponse } from "@/types"
import { BridgeTradePayload } from "@/types/bridge/bridgeTradePayload"
import { Demos } from "@/websdk/demosclass"
import { WrappedCrossChainTrade } from "rubic-sdk"

export default class RubicBridge {
    async getTrade(
        demos: Demos,
        chain: string,
        payload: BridgeTradePayload,
    ): Promise<RPCResponse> {
        const request = {
            method: "bridge",
            params: [
                {
                    method: "get_trade",
                    chain: chain,
                    params: [payload],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }

    async executeTrade(
        demos: Demos,
        chain: string,
        payload: BridgeTradePayload,
    ) {
        const request = {
            method: "bridge",
            params: [
                {
                    method: "execute_trade",
                    chain: chain,
                    params: [payload],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }

    async executeMockTrade(
        demos: Demos,
        chain: string,
        payload: WrappedCrossChainTrade,
    ) {
        const request = {
            method: "bridge",
            params: [
                {
                    method: "execute_mock_trade",
                    chain: chain,
                    params: [payload],
                },
            ],
        }

        return await demos.rpcCall(request, true)
    }
}
