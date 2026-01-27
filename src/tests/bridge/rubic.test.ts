import {
    BLOCKCHAIN_NAME,
    CROSS_CHAIN_TRADE_TYPE,
    CrossChainTrade,
    RubicSdkError,
    WrappedCrossChainTrade,
} from "@/bridge"
import { RubicBridge } from "@/bridge"
import { BridgeTradePayload, SupportedChains } from "@/bridge"

import { Demos } from "@/websdk"
import BigNumber from "bignumber.js"

describe("RubicService", () => {
    const rubicBridge = new RubicBridge()
    const demos: Demos = new Demos()

    beforeAll(async () => {
        await demos.connect("https://node2.demos.sh")
        await demos.connectWallet(
            "0x2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928",
        )
    })

    test("should get trade", async () => {
        try {
            const payload: BridgeTradePayload = {
                fromToken: "USDT",
                toToken: "USDT",
                amount: 10,
                fromChainId: 137,
                toChainId: 1,
            }

            const rpcResponse = await rubicBridge.getTrade(
                demos,
                SupportedChains.POLYGON,
                payload,
            )

            expect(rpcResponse).not.toBeNull()
            expect(rpcResponse.result).toBe(200)

            const tradeResult = rpcResponse.response as
                | WrappedCrossChainTrade
                | RubicSdkError

            if (tradeResult instanceof Error) {
                console.error("Trade error:", tradeResult)
                fail(`Trade failed with error: ${tradeResult.message}`)
            } else {
                expect(tradeResult).not.toBeUndefined()
                expect(tradeResult.trade).not.toBeNull()

                const wrappedTrade = tradeResult.trade

                if (wrappedTrade !== null) {
                    expect(wrappedTrade).toBeDefined()
                    expect(wrappedTrade.from).toBeDefined()
                    expect(wrappedTrade.to).toBeDefined()
                    expect(tradeResult.error).not.toBeDefined()
                }
            }
        } catch (error) {
            console.error("Test error:", error)
            fail(`Unexpected error occurred: ${error}`)
        }
    }, 60000)

    test("should execute trade with mock", async () => {
        const mockTrade = {
            trade: {
                providerAddress: "0x1234",
                routePath: [],
                useProxy: false,
                lastTransactionConfig: null,
                type: CROSS_CHAIN_TRADE_TYPE.LIFI,
                from: {
                    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                    blockchain: BLOCKCHAIN_NAME.ETHEREUM,
                    price: new BigNumber(1),
                    decimals: 18,
                    name: "Ethereum",
                    symbol: "ETH",
                    _weiAmount: "1000000000000000000",
                    weiAmount: new BigNumber("1000000000000000000"),
                    stringWeiAmount: "1000000000000000000",
                    tokenAmount: new BigNumber(1),
                    isNative: true,
                },
                to: {
                    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    blockchain: BLOCKCHAIN_NAME.POLYGON,
                    price: new BigNumber(1),
                    decimals: 6,
                    name: "USD Coin",
                    symbol: "USDC",
                    _weiAmount: "1000000",
                    weiAmount: new BigNumber("1000000"),
                    stringWeiAmount: "1000000",
                    tokenAmount: new BigNumber(1),
                    isNative: false,
                },
                toTokenAmountMin: new BigNumber("1000000"),
                feeInfo: {
                    provider: new BigNumber(0),
                    rubic: new BigNumber(0),
                },
                onChainSubtype: { type: "default" },
                bridgeType: "symbiosis",
                isAggregator: false,
                swap: jest.fn().mockResolvedValue("0x1234567890abcdef"),
                needApprove: jest.fn().mockResolvedValue(false),
            } as unknown as CrossChainTrade,
            tradeType: CROSS_CHAIN_TRADE_TYPE.LIFI,
        }

        const rpcResponse = await rubicBridge.executeMockTrade(
            demos,
            SupportedChains.POLYGON,
            mockTrade,
        )

        expect(rpcResponse).not.toBeNull()
        expect(rpcResponse.result).toBe(200)

        const txHash = rpcResponse.response

        expect(txHash).toBeDefined()
        expect(typeof txHash).toBe("string")
        expect(txHash).toBe("0x1234567890abcdef")
    })

    test.skip("should execute real trade", async () => {
        // Integrate test to do real trade/swap execution
        // Using skip() because it will take real funds

        try {
            const payload: BridgeTradePayload = {
                fromToken: "USDT",
                toToken: "USDT",
                amount: 1,
                fromChainId: 137,
                toChainId: 1,
            }

            const rpcResponse = await rubicBridge.executeTrade(
                demos,
                SupportedChains.POLYGON,
                payload,
            )

            expect(rpcResponse).not.toBeNull()
            expect(rpcResponse.result).toBe(200)

            const txHash = rpcResponse.response
            expect(txHash).toBeDefined()
            expect(typeof txHash).toBe("string")
        } catch (error) {
            console.error("Test error:", error)
            fail(`Unexpected error occurred: ${error}`)
        }
    }, 60000)
})
