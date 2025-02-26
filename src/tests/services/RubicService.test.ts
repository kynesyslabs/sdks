import BigNumber from "bignumber.js"
import {
    BLOCKCHAIN_NAME,
    CROSS_CHAIN_TRADE_TYPE,
    CrossChainTrade,
} from "rubic-sdk"
import { RubicService } from "@/services/RubicService"

describe("RubicService", () => {
    let rubicService: RubicService

    beforeEach(() => {
        const privateKey = "" // Add PK
        rubicService = new RubicService(privateKey, "MULTICHAIN")
    })

    test("should get trade", async () => {
        const trade = await rubicService.getTrade("USDT", "USDT", "10", 137, 1)
        const wrappedTrade = trade.trade

        expect(wrappedTrade).toBeDefined()

        if (wrappedTrade !== null) {
            expect(wrappedTrade).toBeDefined()
            expect(wrappedTrade.from).toBeDefined()
            expect(wrappedTrade.to).toBeDefined()
            expect(typeof wrappedTrade.swap).toBe("function")
            expect(trade.error).not.toBeDefined()
        }
    }, 30000)

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

    afterEach(() => {
        jest.clearAllMocks()
    })
})
