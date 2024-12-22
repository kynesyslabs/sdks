import { EvmChain, EvmCoinFinder } from "../../abstraction/EvmCoinFinder"
import { ethers } from "ethers"
// Mock the JsonRpcProvider
jest.mock("ethers", () => ({
    ...jest.requireActual("ethers"),
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getCode: jest.fn().mockResolvedValue("0x123"),
        getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
    })),
    isAddress: jest.requireActual("ethers").isAddress,
}))

describe("EVM COIN FINDER TESTS", () => {
    const ETHEREUM_CHAIN_ID = 1
    const BSC_CHAIN_ID = 56
    const ARBITRUM_CHAIN_ID = 42161
    const OPTIMISM_CHAIN_ID = 10
    const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

    test("findNativeEth returns WETH addresses across chains", async () => {
        const result = await EvmCoinFinder.findNativeEth([
            ETHEREUM_CHAIN_ID,
            BSC_CHAIN_ID,
            ARBITRUM_CHAIN_ID,
            OPTIMISM_CHAIN_ID,
        ])
        expect(result[ETHEREUM_CHAIN_ID]).toBeDefined()
        expect(result[BSC_CHAIN_ID]).toBeDefined()
        expect(result[ARBITRUM_CHAIN_ID]).toBeDefined()
        expect(result[OPTIMISM_CHAIN_ID]).toBeDefined()
    })

    test("findNativeAssets returns native and wrapped assets across chains", async () => {
        const result = await EvmCoinFinder.findNativeAssets([
            BSC_CHAIN_ID,
            ARBITRUM_CHAIN_ID,
            OPTIMISM_CHAIN_ID,
        ])

        // Native should always exist
        expect(result[BSC_CHAIN_ID].native).toBeDefined()
        expect(result[ARBITRUM_CHAIN_ID].native).toBeDefined()
        expect(result[OPTIMISM_CHAIN_ID].native).toBeDefined()

        // Wrapped might exist
        if (result[BSC_CHAIN_ID].wrapped) {
            expect(ethers.isAddress(result[BSC_CHAIN_ID].wrapped)).toBe(true)
        }
        if (result[ARBITRUM_CHAIN_ID].wrapped) {
            expect(ethers.isAddress(result[ARBITRUM_CHAIN_ID].wrapped)).toBe(
                true,
            )
        }
        if (result[OPTIMISM_CHAIN_ID].wrapped) {
            expect(ethers.isAddress(result[OPTIMISM_CHAIN_ID].wrapped)).toBe(
                true,
            )
        }
    })

    test("findTokenPairs returns corresponding tokens across chains", async () => {
        const result = await EvmCoinFinder.findTokenPairs(
            USDC_ETH,
            ETHEREUM_CHAIN_ID,
            [BSC_CHAIN_ID, ARBITRUM_CHAIN_ID, OPTIMISM_CHAIN_ID],
        )
        expect(result[BSC_CHAIN_ID]).toBeDefined()
        expect(result[ARBITRUM_CHAIN_ID]).toBeDefined()
        expect(result[OPTIMISM_CHAIN_ID]).toBeDefined()
    })

    test("findTokenPairs rejects invalid addresses", async () => {
        await expect(
            EvmCoinFinder.findTokenPairs("invalid-address", ETHEREUM_CHAIN_ID, [
                BSC_CHAIN_ID,
            ]),
        ).rejects.toThrow("Invalid token address")
    })

    test("getNativeForSupportedChain returns native addresses for all supported chains", () => {
        expect(
            EvmCoinFinder.getNativeForSupportedChain(
                EvmChain.ETHEREUM,
                ETHEREUM_CHAIN_ID,
            ),
        ).toBeDefined()
        expect(
            EvmCoinFinder.getNativeForSupportedChain(
                EvmChain.BSC,
                BSC_CHAIN_ID,
            ),
        ).toBeDefined()
        expect(
            EvmCoinFinder.getNativeForSupportedChain(
                EvmChain.ARBITRUM,
                ARBITRUM_CHAIN_ID,
            ),
        ).toBeDefined()
        expect(
            EvmCoinFinder.getNativeForSupportedChain(
                EvmChain.OPTIMISM,
                OPTIMISM_CHAIN_ID,
            ),
        ).toBeDefined()
    })
})
