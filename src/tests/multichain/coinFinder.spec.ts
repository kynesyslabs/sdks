import { CoinFinder } from "../../abstraction/CoinFinder"
import {
    BaseChain,
    type SupportedChain,
    tokenAddresses,
} from "../../abstraction/providers/CoinAddresses"

describe("CoinFinder.getNativeForSupportedChain", () => {
    test.each<[SupportedChain, number]>([
        ["bsc_testnet", 97],
        ["ethereum_testnet", 11155111],
        ["arbitrum_testnet", 421614],
        ["optimism_testnet", 11155420],
        ["bsc_mainnet", 56],
    ])("returns the native token for %s with chain ID %i", (chain, id) => {
        expect(CoinFinder.getNativeForSupportedChain(chain, id)).toBe(
            "0x0000000000000000000000000000000000000000",
        )
    })

    test("rejects the BSC mainnet ID for bsc_testnet", () => {
        expect(() => CoinFinder.getNativeForSupportedChain("bsc_testnet", 56))
            .toThrow("Chain ID doesn't match bsc")
    })
})

describe("NON-EVM COIN FINDER TESTS", () => {
    describe("Finding wrapped tokens", () => {
        test("should find wrapped BTC on EVM chains", async () => {
            const wrappedOnEth = await CoinFinder.findWrappedToken(
                BaseChain.BITCOIN,
                BaseChain.ETHEREUM,
            )
            expect(wrappedOnEth).toBe(
                tokenAddresses.bitcoin.wrapped.ethereum.mainnet,
            )

            const wrappedOnBsc = await CoinFinder.findWrappedToken(
                BaseChain.BITCOIN,
                BaseChain.BSC,
            )
            expect(wrappedOnBsc).toBe(
                tokenAddresses.bitcoin.wrapped.bsc.mainnet,
            )
        })

        test("should find wrapped XRP on EVM chains", async () => {
            const wrappedOnEth = await CoinFinder.findWrappedToken(
                BaseChain.XRP,
                BaseChain.ETHEREUM,
            )
            expect(wrappedOnEth).toBe(
                tokenAddresses.xrp.wrapped.ethereum.mainnet,
            )

            const wrappedOnBsc = await CoinFinder.findWrappedToken(
                BaseChain.XRP,
                BaseChain.BSC,
            )
            expect(wrappedOnBsc).toBe(tokenAddresses.xrp.wrapped.bsc.mainnet)
        })

        test("should return false for unsupported chains", async () => {
            const result = await CoinFinder.findWrappedToken(
                BaseChain.BITCOIN,
                BaseChain.SOLANA,
            )
            expect(result).toBe(false)
        })
    })
})
