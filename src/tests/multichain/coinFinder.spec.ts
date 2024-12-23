import {
    CoinFinder,
    Chain,
    ChainEnvironment,
} from "../../abstraction/CoinFinder"
import { tokenAddresses } from "../../abstraction/providers/CoinAddresses"

describe("NON-EVM COIN FINDER TESTS", () => {
    describe("Environment Validation", () => {
        test("should accept valid environments", async () => {
            await expect(
                CoinFinder.findNativeAssets(
                    [Chain.SOLANA],
                    ChainEnvironment.MAINNET,
                ),
            ).resolves.toBeDefined()
        })

        test("should reject invalid environments", async () => {
            await expect(
                CoinFinder.findNativeAssets(
                    [Chain.SOLANA],
                    "invalid" as ChainEnvironment,
                ),
            ).rejects.toThrow("Invalid chain environment")
        })
    })

    describe("Native Asset Finding", () => {
        test("should find native assets for Solana", async () => {
            const result = await CoinFinder.findNativeAssets(
                [Chain.SOLANA],
                ChainEnvironment.MAINNET,
            )

            expect(result[Chain.SOLANA]).toBe(tokenAddresses.sol.mainnet)
        })
    })

    describe("Token Pair Finding", () => {
        test("should map USDC across chains", async () => {
            const result = await CoinFinder.findTokenPairs(
                tokenAddresses.usdc.solana.mainnet,
                Chain.SOLANA,
                [Chain.MULTIVERSX, Chain.XRP],
                ChainEnvironment.MAINNET,
            )

            // MultiversX has USDC support
            expect(result[Chain.MULTIVERSX]).toBe(
                tokenAddresses.usdc.multiversx.mainnet,
            )
            // XRP doesn't have USDC support yet
            expect(result[Chain.XRP]).toBe(false)
        })

        test("should return same address for same chain", async () => {
            const sourceAddress = tokenAddresses.usdc.solana.mainnet
            const result = await CoinFinder.findTokenPairs(
                sourceAddress,
                Chain.SOLANA,
                [Chain.SOLANA],
                ChainEnvironment.MAINNET,
            )

            expect(result[Chain.SOLANA]).toBe(sourceAddress)
        })
    })
})
