import Providers from "./providers"
import { tokenAddresses } from "./providers/CoinAddresses"
import * as ethers from "ethers"
import { chainIds } from "./providers/CoinAddresses"
export type SupportedChain = "ethereum" | "bsc" | "arbitrum" | "optimism"

export default class EvmCoinFinder {
    private static isValidAddress(address: string): boolean {
        return ethers.isAddress(address)
    }

    private static async getRandomProvider(chainId: number) {
        const rpcUrls = Providers.evm[chainId.toString()]

        if (!rpcUrls || rpcUrls.length === 0) {
            throw new Error(`No providers found for chain ${chainId}`)
        }

        // Shuffle RPC URLs to try them in random order
        const shuffledUrls = [...rpcUrls].sort(() => Math.random() - 0.5)

        // Try each RPC until one works
        for (const rpcUrl of shuffledUrls) {
            try {
                // Create ethers provider
                const provider = new ethers.JsonRpcProvider(rpcUrl)
                // Test the connection
                await provider.getNetwork()
                return provider
            } catch (error) {
                console.warn(`Failed to connect to RPC ${rpcUrl}:`, error)
                continue // Try next RPC
            }
        }

        throw new Error(`All RPC providers failed for chain ${chainId}`)
    }

    static async findNativeEth(
        targetChainIds: number[],
    ): Promise<Record<number, { eth: string; weth: string }>> {
        const result: Record<number, { eth: string; weth: string }> = {}

        for (const chainId of targetChainIds) {
            // First validate if chainId is supported
            if (
                ![
                    chainIds.eth.mainnet,
                    chainIds.bsc.mainnet,
                    chainIds.arbitrum.mainnet,
                    chainIds.optimism.mainnet,
                ].includes(chainId)
            ) {
                throw new Error(`Invalid chain ID: ${chainId}`)
            }

            let weth
            switch (chainId) {
                case chainIds.eth.mainnet:
                    weth = tokenAddresses.eth.wrapped.ethereum.mainnet
                    break
                case chainIds.bsc.mainnet:
                    weth = tokenAddresses.eth.wrapped.bsc.mainnet
                    break
                case chainIds.arbitrum.mainnet:
                    weth = tokenAddresses.eth.wrapped.arbitrum.mainnet
                    break
                case chainIds.optimism.mainnet:
                    weth = tokenAddresses.eth.wrapped.optimism.mainnet
                    break
            }

            if (weth) {
                result[chainId] = {
                    eth: tokenAddresses.eth.mainnet, // native ETH
                    weth: weth!, // wrapped ETH
                }
            }
        }
        return result
    }

    static async findNativeAssets(
        targetChainIds: number[],
    ): Promise<Record<number, { native: string; wrapped?: string }>> {
        const result: Record<number, { native: string; wrapped?: string }> = {}

        for (const chainId of targetChainIds) {
            let wrapped
            switch (chainId) {
                case chainIds.eth.mainnet:
                    wrapped = tokenAddresses.eth.wrapped.ethereum.mainnet
                    break
                case chainIds.bsc.mainnet:
                    wrapped = tokenAddresses.eth.wrapped.bsc.mainnet
                    break
                case chainIds.arbitrum.mainnet:
                    wrapped = tokenAddresses.eth.wrapped.arbitrum.mainnet
                    break
                case chainIds.optimism.mainnet:
                    wrapped = tokenAddresses.eth.wrapped.optimism.mainnet
                    break
            }

            // Always include native, wrapped is optional
            result[chainId] = {
                native: tokenAddresses.eth.mainnet,
                ...(wrapped && { wrapped }), // Only include wrapped if it exists
            }
        }
        return result
    }

    static async findTokenPairs(
        tokenAddress: string,
        sourceChainId: number,
        targetChainIds: number[],
    ): Promise<Record<number, string | false>> {
        if (!this.isValidAddress(tokenAddress)) {
            throw new Error("Invalid token address")
        }

        const result: Record<number, string | false> = {}

        // Verify token exists on source chain
        const provider = await this.getRandomProvider(sourceChainId)
        const code = await provider.getCode(tokenAddress)
        if (code === "0x") {
            throw new Error("Token contract not found on source chain")
        }

        // Find corresponding tokens on target chains
        for (const chainId of targetChainIds) {
            // If source and target chains are the same, return the same address
            if (chainId === sourceChainId) {
                result[chainId] = tokenAddress
                continue
            }

            let mappedToken: string | false = false

            // Check if it's USDC
            if (tokenAddress === tokenAddresses.usdc.ethereum.mainnet) {
                if (chainId === chainIds.bsc.mainnet) {
                    mappedToken = tokenAddresses.usdc.bsc.mainnet
                } else if (chainId === chainIds.arbitrum.mainnet) {
                    mappedToken = tokenAddresses.usdc.arbitrum.mainnet
                } else if (chainId === chainIds.optimism.mainnet) {
                    mappedToken = tokenAddresses.usdc.optimism.mainnet
                }
            }
            // Check if it's USDT
            else if (tokenAddress === tokenAddresses.usdt.ethereum.mainnet) {
                if (chainId === chainIds.bsc.mainnet) {
                    mappedToken = tokenAddresses.usdt.bsc.mainnet
                } else if (chainId === chainIds.arbitrum.mainnet) {
                    mappedToken = tokenAddresses.usdt.arbitrum.mainnet
                } else if (chainId === chainIds.optimism.mainnet) {
                    mappedToken = tokenAddresses.usdt.optimism.mainnet
                }
            }

            result[chainId] = mappedToken
        }

        return result
    }

    static getNativeForSupportedChain(
        chain: SupportedChain,
        targetChainId: number,
    ): string {
        // Validate chain matches targetChainId
        switch (chain) {
            case "ethereum":
                if (targetChainId !== chainIds.eth.mainnet) {
                    throw new Error("Chain ID doesn't match ethereum")
                }
                break
            case "bsc":
                if (targetChainId !== chainIds.bsc.mainnet) {
                    throw new Error("Chain ID doesn't match bsc")
                }
                break
            case "arbitrum":
                if (targetChainId !== chainIds.arbitrum.mainnet) {
                    throw new Error("Chain ID doesn't match arbitrum")
                }
                break
            case "optimism":
                if (targetChainId !== chainIds.optimism.mainnet) {
                    throw new Error("Chain ID doesn't match optimism")
                }
                break
            default:
                throw new Error(`Unsupported chain: ${chain}`)
        }

        // Return native address (0x0)
        return tokenAddresses.eth.mainnet
    }
}
