import Providers from "./providers"
import { tokenAddresses, chainIds } from "./providers/CoinAddresses"
import * as ethers from "ethers"

export enum EvmChain {
    ETHEREUM = "ethereum",
    BSC = "bsc",
    ARBITRUM = "arbitrum",
    OPTIMISM = "optimism",
}

export class EvmCoinFinder {
    private static isValidAddress(address: string): boolean {
        return ethers.isAddress(address)
    }

    private static getChainNameFromId(chainId: number): EvmChain | undefined {
        switch (chainId) {
            case chainIds.eth.mainnet:
                return EvmChain.ETHEREUM
            case chainIds.bsc.mainnet:
                return EvmChain.BSC
            case chainIds.arbitrum.mainnet:
                return EvmChain.ARBITRUM
            case chainIds.optimism.mainnet:
                return EvmChain.OPTIMISM
            default:
                return undefined
        }
    }

    private static async getRandomProvider(chainId: number) {
        // Filter out Flashbots and Payload RPCs
        const rpcUrls = Providers.evm[chainId.toString()].filter(
            url =>
                !url.includes("flashbots.net") && !url.includes("payload.de"),
        )

        if (!rpcUrls || rpcUrls.length === 0) {
            throw new Error(`No providers found for chain ${chainId}`)
        }

        // Shuffle RPC URLs to try them in random order
        const shuffledUrls = [...rpcUrls].sort(() => Math.random() - 0.5)

        // Try each RPC until one works
        for (const rpcUrl of shuffledUrls) {
            try {
                // Create ethers provider
                const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
                    staticNetwork: true, // Prevent network detection
                })
                await provider.getNetwork() // Test the connection
                return provider
            } catch (error) {
                console.warn(`Failed to connect to RPC ${rpcUrl}:`, error)
                continue // Try next RPC
            }
        }

        throw new Error(`All RPC providers failed for chain ${chainId}`)
    }

    private static validateChainId(chainId: number): void {
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
    }

    static async findNativeEth(
        targetChainIds: number[],
    ): Promise<Record<number, { eth: string; weth: string }>> {
        const result: Record<number, { eth: string; weth: string }> = {}

        for (const chainId of targetChainIds) {
            this.validateChainId(chainId)

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

        // Get chain names for lookup
        const sourceChain = this.getChainNameFromId(sourceChainId)
        if (!sourceChain) {
            throw new Error(`Unsupported chain ID: ${sourceChainId}`)
        }

        for (const targetChainId of targetChainIds) {
            // Same chain = same address
            if (targetChainId === sourceChainId) {
                result[targetChainId] = tokenAddress
                continue
            }

            const targetChain = this.getChainNameFromId(targetChainId)
            if (!targetChain) {
                result[targetChainId] = false
                continue
            }

            // Check USDC mapping
            if (tokenAddress === tokenAddresses.usdc[sourceChain]?.mainnet) {
                result[targetChainId] =
                    tokenAddresses.usdc[targetChain]?.mainnet || false
                continue
            }

            // Check USDT mapping
            if (tokenAddress === tokenAddresses.usdt[sourceChain]?.mainnet) {
                result[targetChainId] =
                    tokenAddresses.usdt[targetChain]?.mainnet || false
                continue
            }

            result[targetChainId] = false
        }

        return result
    }

    static getNativeForSupportedChain(
        chain: EvmChain,
        targetChainId: number,
    ): string {
        // Validate chain matches targetChainId
        switch (chain) {
            case EvmChain.ETHEREUM:
                if (targetChainId !== chainIds.eth.mainnet) {
                    throw new Error("Chain ID doesn't match ethereum")
                }
                break
            case EvmChain.BSC:
                if (targetChainId !== chainIds.bsc.mainnet) {
                    throw new Error("Chain ID doesn't match bsc")
                }
                break
            case EvmChain.ARBITRUM:
                if (targetChainId !== chainIds.arbitrum.mainnet) {
                    throw new Error("Chain ID doesn't match arbitrum")
                }
                break
            case EvmChain.OPTIMISM:
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
