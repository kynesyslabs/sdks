import {
    CoinFinder,
    Chain,
    ChainEnvironment,
} from "../../abstraction/CoinFinder"
import { tokenAddresses } from "../../abstraction/providers/CoinAddresses"

describe("COIN FINDER TESTS", () => {
    describe("Environment Validation", () => {
        test("should accept valid environments", async () => {
            await expect(
                CoinFinder.findNativeAssets(
                    [Chain.SOLANA],
                    ChainEnvironment.MAINNET,
                ),
            ).resolves.toBeDefined()
            await expect(
                CoinFinder.findNativeAssets(
                    [Chain.SOLANA],
                    ChainEnvironment.TESTNET,
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
        test("should find native assets for multiple chains", async () => {
            const chains = [Chain.SOLANA, Chain.MULTIVERSX, Chain.XRP]
            const result = await CoinFinder.findNativeAssets(
                chains,
                ChainEnvironment.MAINNET,
            )

            expect(result[Chain.SOLANA]).toBe(tokenAddresses.sol.mainnet)
            expect(result[Chain.MULTIVERSX]).toBe(
                tokenAddresses.multiversx.mainnet,
            )
            expect(result[Chain.XRP]).toBe(tokenAddresses.xrp.mainnet)
        })
    })

    describe("Token Pair Finding", () => {
        test("should map USDC across chains", async () => {
            // Debug log
            console.log("USDC addresses:", {
                multiversx: tokenAddresses.usdc.multiversx?.mainnet,
                xrp: tokenAddresses.usdc.xrp?.mainnet,
            })
            const result = await CoinFinder.findTokenPairs(
                tokenAddresses.usdc.solana.mainnet,
                Chain.SOLANA,
                [Chain.MULTIVERSX, Chain.XRP],
                ChainEnvironment.MAINNET,
            )

            console.log("Result:", result)

            if (tokenAddresses.usdc.multiversx?.mainnet) {
                expect(result[Chain.MULTIVERSX]).toBe(
                    tokenAddresses.usdc.multiversx.mainnet,
                )
            } else {
                expect(result[Chain.MULTIVERSX]).toBe(false)
            }

            if (tokenAddresses.usdc.xrp?.mainnet) {
                expect(result[Chain.XRP]).toBe(tokenAddresses.usdc.xrp.mainnet)
            } else {
                expect(result[Chain.XRP]).toBe(false)
            }
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

        test("should return false for unknown token mappings", async () => {
            const result = await CoinFinder.findTokenPairs(
                tokenAddresses.sol.mainnet, // Using SOL token address
                Chain.SOLANA,
                [Chain.MULTIVERSX, Chain.XRP],
                ChainEnvironment.MAINNET,
            )

            expect(result[Chain.MULTIVERSX]).toBe(false)
            expect(result[Chain.XRP]).toBe(false)
        })

        test("should reject invalid addresses", async () => {
            await expect(
                CoinFinder.findTokenPairs(
                    "invalid-address",
                    Chain.SOLANA,
                    [Chain.MULTIVERSX],
                    ChainEnvironment.MAINNET,
                ),
            ).rejects.toThrow("Invalid token address")
        })

        test("should map USDT across chains", async () => {
            const result = await CoinFinder.findTokenPairs(
                tokenAddresses.usdt.solana.mainnet,
                Chain.SOLANA,
                [Chain.MULTIVERSX, Chain.XRP],
                ChainEnvironment.MAINNET,
            )

            if (tokenAddresses.usdt.multiversx?.mainnet) {
                expect(result[Chain.MULTIVERSX]).toBe(
                    tokenAddresses.usdt.multiversx.mainnet,
                )
            } else {
                expect(result[Chain.MULTIVERSX]).toBe(false)
            }

            if (tokenAddresses.usdt.xrp?.mainnet) {
                expect(result[Chain.XRP]).toBe(tokenAddresses.usdt.xrp.mainnet)
            } else {
                expect(result[Chain.XRP]).toBe(false)
            }
        })
    })
})
