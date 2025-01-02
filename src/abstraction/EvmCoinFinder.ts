import Providers from "./providers"
import { tokenAddresses, chainIds, BaseChain } from "./providers/CoinAddresses"
import * as ethers from "ethers"

type SupportedChainId =
    | typeof chainIds.eth.mainnet
    | typeof chainIds.bsc.mainnet
    | typeof chainIds.arbitrum.mainnet
    | typeof chainIds.optimism.mainnet

interface EvmTokenPair {
    native: string
    wrapped: string | false
}

/**
 * Error class for EVM coin finder
 * @extends Error
 * @param {string} message - The error message
 * @param {string} code - The error code
 * @param {any} details - The error details
 */
export class EvmError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: any,
    ) {
        super(message)
    }
}

/**
 * Class for finding wrapped tokens on EVM chains
 * @throws {EvmError} With code 'UNSUPPORTED_CHAIN_ID' if chain ID is not supported
 * @throws {EvmError} With code 'INVALID_ADDRESS' if token address is invalid
 * @throws {EvmError} With code 'CONTRACT_NOT_FOUND' if token contract doesn't exist
 */
export class EvmCoinFinder {
    private static getChainName(chainId: SupportedChainId): BaseChain {
        switch (chainId) {
            case chainIds.eth.mainnet:
                return BaseChain.ETHEREUM
            case chainIds.bsc.mainnet:
                return BaseChain.BSC
            case chainIds.arbitrum.mainnet:
                return BaseChain.ARBITRUM
            case chainIds.optimism.mainnet:
                return BaseChain.OPTIMISM
            default:
                throw new Error(`Unsupported chain ID: ${chainId}`)
        }
    }

    private static isValidAddress(address: string): boolean {
        return ethers.isAddress(address)
    }

    private static getChainNameFromId(chainId: number): BaseChain | undefined {
        switch (chainId) {
            case chainIds.eth.mainnet:
                return BaseChain.ETHEREUM
            case chainIds.bsc.mainnet:
                return BaseChain.BSC
            case chainIds.arbitrum.mainnet:
                return BaseChain.ARBITRUM
            case chainIds.optimism.mainnet:
                return BaseChain.OPTIMISM
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

    static validateChainId(
        chainId: number,
    ): asserts chainId is SupportedChainId {
        if (
            !Object.values(chainIds).some(chain =>
                Object.values(chain).includes(chainId),
            )
        ) {
            throw new EvmError(
                `Unsupported chain ID: ${chainId}`,
                "UNSUPPORTED_CHAIN_ID",
            )
        }
    }

    /**
     * Finds native ETH and WETH addresses for given chain IDs
     * @param {SupportedChainId[]} targetChainIds - Array of supported chain IDs
     * @returns {Promise<Record<SupportedChainId, EvmTokenPair>>}
     * @throws {EvmError} With code 'UNSUPPORTED_CHAIN_ID' if any chain ID is not supported
     */
    static async findNativeEth(
        targetChainIds: SupportedChainId[],
    ): Promise<Record<SupportedChainId, EvmTokenPair>> {
        const result: Record<SupportedChainId, EvmTokenPair> = {}

        for (const chainId of targetChainIds) {
            this.validateChainId(chainId)

            let weth: string | undefined
            switch (chainId) {
                case chainIds.eth.mainnet:
                    weth = tokenAddresses.ethereum.wrapped.ethereum.mainnet
                    break
                case chainIds.bsc.mainnet:
                    weth = tokenAddresses.ethereum.wrapped.bsc.mainnet
                    break
                case chainIds.arbitrum.mainnet:
                    weth = tokenAddresses.ethereum.wrapped.arbitrum.mainnet
                    break
                case chainIds.optimism.mainnet:
                    weth = tokenAddresses.ethereum.wrapped.optimism.mainnet
                    break
            }

            if (weth) {
                result[chainId] = {
                    native: tokenAddresses.ethereum.mainnet, // native ETH
                    wrapped: weth!, // wrapped ETH
                }
            }
        }
        return result
    }

    /**
     * Finds the wrapped assets for the given chain IDs
     * @param {SupportedChainId[]} targetChainIds The chain IDs to find wrapped assets for
     * @returns {Promise<Record<number, EvmTokenPair>>} An object with the wrapped assets for each chain ID or false if not found
     */
    static async findWrappedAssets(
        targetChainIds: SupportedChainId[],
    ): Promise<Record<SupportedChainId, EvmTokenPair>> {
        const result: Record<SupportedChainId, EvmTokenPair> = {}

        for (const chainId of targetChainIds) {
            this.validateChainId(chainId)
            result[chainId] = {
                native: tokenAddresses.ethereum.mainnet,
                wrapped:
                    tokenAddresses.ethereum.wrapped[this.getChainName(chainId)]
                        ?.mainnet || false,
            }
        }
        return result
    }

    /**
     * Finds wrapped token addresses across different chains
     * @param {string} tokenAddress - Token address on source chain
     * @param {SupportedChainId} sourceChainId - Chain ID where token exists
     * @param {SupportedChainId[]} targetChainIds - Chain IDs to find wrapped versions
     * @returns {Promise<Record<SupportedChainId, EvmTokenPair>>} Map of chain IDs to token addresses
     * @throws {EvmError} With various error codes for different failure cases
     */
    static async findTokenPairs(
        tokenAddress: string,
        sourceChainId: SupportedChainId,
        targetChainIds: SupportedChainId[],
    ): Promise<Record<SupportedChainId, EvmTokenPair>> {
        if (!this.isValidAddress(tokenAddress)) {
            throw new EvmError("Invalid token address", "INVALID_ADDRESS", {
                address: tokenAddress,
            })
        }

        const result: Record<SupportedChainId, EvmTokenPair> = {}

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
                result[targetChainId] = {
                    native: tokenAddress,
                    wrapped: false,
                }
                continue
            }

            const targetChain = this.getChainNameFromId(targetChainId)
            if (!targetChain) {
                result[targetChainId] = {
                    native: tokenAddress,
                    wrapped: false,
                }
                continue
            }

            // Check USDC mapping
            if (tokenAddress === tokenAddresses.usdc[sourceChain]?.mainnet) {
                result[targetChainId] = {
                    native: tokenAddress,
                    wrapped: tokenAddresses.usdc[targetChain]?.mainnet || false,
                }
                continue
            }

            // Check USDT mapping
            if (tokenAddress === tokenAddresses.usdt[sourceChain]?.mainnet) {
                result[targetChainId] = {
                    native: tokenAddress,
                    wrapped: tokenAddresses.usdt[targetChain]?.mainnet || false,
                }
                continue
            }

            result[targetChainId] = {
                native: tokenAddress,
                wrapped: false,
            }
        }

        return result
    }

    /**
     * Finds the native address for the given chain ID
     * @param {string} chain The chain to find the native address for
     * @param {number} targetChainId The chain ID to find the native address for
     * @returns {string} The native address for the given chain ID
     */
    static getNativeForSupportedChain(
        chain: string,
        targetChainId: number,
    ): string {
        // Validate chain matches targetChainId
        switch (chain) {
            case BaseChain.ETHEREUM:
                if (targetChainId !== chainIds.eth.mainnet) {
                    throw new Error("Chain ID doesn't match ethereum")
                }
                return tokenAddresses.ethereum.mainnet
            case BaseChain.BSC:
                if (targetChainId !== chainIds.bsc.mainnet) {
                    throw new Error("Chain ID doesn't match bsc")
                }
                break
            case BaseChain.ARBITRUM:
                if (targetChainId !== chainIds.arbitrum.mainnet) {
                    throw new Error("Chain ID doesn't match arbitrum")
                }
                break
            case BaseChain.OPTIMISM:
                if (targetChainId !== chainIds.optimism.mainnet) {
                    throw new Error("Chain ID doesn't match optimism")
                }
                break
            default:
                throw new Error(`Unsupported chain: ${chain}`)
        }

        // Return native address (0x0)
        return tokenAddresses.ethereum.mainnet
    }
}
