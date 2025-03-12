import BigNumber from "bignumber.js"
import {
    BLOCKCHAIN_NAME,
    CROSS_CHAIN_TRADE_TYPE,
    CrossChainTrade,
} from "rubic-sdk"
import { RubicService } from "@/bridge/services/rubic"

describe("RubicService", () => {
    let rubicService: RubicService
    const privateKey = "" // Add Wallet PK for testing

    beforeEach(() => {
        rubicService = new RubicService(privateKey, "POLYGON")
    })

    test("should get trade", async () => {
        try {
            await rubicService.waitForInitialization()

            const tradeResult = await rubicService.getTrade(
                "USDT",
                "USDT",
                10,
                137,
                1,
            )

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
                    expect(typeof wrappedTrade.swap).toBe("function")
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

        const txHash = await rubicService.executeTrade(mockTrade)

        expect(txHash).toBeDefined()
        expect(typeof txHash).toBe("string")
        expect(txHash).toBe("0x1234567890abcdef")
    })

    test("should execute real trade", async () => {
        // Integrate test to do real trade/swap execution
        // Using skip() because it will take real funds

        try {
            await rubicService.waitForInitialization()

            const tradeResult = await rubicService.getTrade(
                "USDT",
                "USDT",
                0.5,
                137,
                1,
            )

            if (tradeResult instanceof Error) {
                console.error("Trade error:", tradeResult)
                fail(`Trade failed with error: ${tradeResult.message}`)
            } else {
                const executedTrade = await rubicService.executeTrade(
                    tradeResult,
                )

                // Continue ...
            }
        } catch (error: any) {
            console.error("Test error:", error)
            fail(`Unexpected error occurred: ${error}`)
        }
    }, 60000)
})
