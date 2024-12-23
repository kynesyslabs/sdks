import { CoinFinder } from "../../abstraction/CoinFinder"
import { tokenAddresses } from "../../abstraction/providers/CoinAddresses"

describe("NON-EVM COIN FINDER TESTS", () => {
    describe("Finding wrapped tokens", () => {
        test("should find wrapped BTC on EVM chains", async () => {
            const wrappedOnEth = await CoinFinder.findBTC("ethereum")
            expect(wrappedOnEth).toBe(
                tokenAddresses.btc.wrapped.ethereum.mainnet,
            )

            const wrappedOnBsc = await CoinFinder.findBTC("bsc")
            expect(wrappedOnBsc).toBe(tokenAddresses.btc.wrapped.bsc.mainnet)
        })

        test("should find wrapped XRP on EVM chains", async () => {
            const wrappedOnEth = await CoinFinder.findXRP("ethereum")
            expect(wrappedOnEth).toBe(
                tokenAddresses.xrp.wrapped.ethereum.mainnet,
            )

            const wrappedOnBsc = await CoinFinder.findXRP("bsc")
            expect(wrappedOnBsc).toBe(tokenAddresses.xrp.wrapped.bsc.mainnet)
        })

        test("should return false for unsupported chains", async () => {
            const result = await CoinFinder.findBTC("unsupported-chain")
            expect(result).toBe(false)
        })
    })
})
