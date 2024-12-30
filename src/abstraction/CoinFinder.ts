import {
    BaseChain,
    ChainType,
    NetworkType,
    tokenAddresses,
    chainIds,
    SupportedChain,
} from "./providers/CoinAddresses"

/**
 * Class for finding wrapped tokens on various chains
 */
export class CoinFinder {
    private static validateChain(chain: BaseChain) {
        if (!Object.values(BaseChain).includes(chain)) {
            throw new Error(`Invalid chain: ${chain}`)
        }
    }

    /**
     * Finds the wrapped token address for a given source chain on a target chain
     * @param {BaseChain} sourceChain The chain whose token we want to find (e.g., BITCOIN, SOLANA)
     * @param {BaseChain} targetChain The chain where we want to find the wrapped token
     * @returns {Promise<string | false>} The wrapped token address or false if not found
     */
    static async findWrappedToken(
        sourceChain: BaseChain,
        targetChain: BaseChain,
    ): Promise<string | false> {
        this.validateChain(sourceChain)
        this.validateChain(targetChain)
        return (
            tokenAddresses[sourceChain].wrapped?.[targetChain]?.mainnet || false
        )
    }

    /**
     * Gets the native token address for any supported chain
     * @param {SupportedChain} chain The supported chain to find the native address for (e.g., "ethereum_mainnet")
     * @param {number} targetChainId The chain ID to find the native address for (e.g., 1 for Ethereum mainnet)
     * @returns {string} The native token address for the given chain ID
     * @throws {Error} If chain ID doesn't match the chain or if chain is unsupported
     */
    static getNativeForSupportedChain(
        chain: SupportedChain,
        targetChainId: number = 1,
    ): string {
        const [chainType, networkType] = chain.split("_") as [
            ChainType,
            NetworkType,
        ]

        // Handle EVM chains
        switch (chainType) {
            case BaseChain.ETHEREUM:
            case BaseChain.BSC:
            case BaseChain.ARBITRUM:
            case BaseChain.OPTIMISM:
                // Validate chain ID matches the chain
                const chainIdMap = {
                    [BaseChain.ETHEREUM]: chainIds.eth.mainnet,
                    [BaseChain.BSC]: chainIds.bsc.mainnet,
                    [BaseChain.ARBITRUM]: chainIds.arbitrum.mainnet,
                    [BaseChain.OPTIMISM]: chainIds.optimism.mainnet,
                }
                if (targetChainId !== chainIdMap[chainType]) {
                    throw new Error(`Chain ID doesn't match ${chainType}`)
                }
                return tokenAddresses.ethereum[networkType]

            // Handle non-EVM chains
            case BaseChain.SOLANA:
            case BaseChain.MULTIVERSX:
            case BaseChain.XRP:
            case BaseChain.BITCOIN:
            case BaseChain.TON:
                if (targetChainId !== 1) {
                    throw new Error(
                        "Non-EVM chains only support targetChainId 1",
                    )
                }
                return tokenAddresses[chainType][networkType]

            default:
                throw new Error(`Unsupported chain: ${chain}`)
        }
    }
}
