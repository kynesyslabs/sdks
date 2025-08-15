import { CoinFinder } from "../../abstraction/CoinFinder"
import {
    BaseChain,
    tokenAddresses,
} from "../../abstraction/providers/CoinAddresses"

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
