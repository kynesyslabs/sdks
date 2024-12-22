import { tokenAddresses } from "./providers/CoinAddresses"

export enum Chain {
    SOLANA = "solana",
    MULTIVERSX = "multiversx",
    XRP = "xrp",
    BITCOIN = "bitcoin",
    TON = "ton",
}

export enum ChainEnvironment {
    MAINNET = "mainnet",
    TESTNET = "testnet",
}

interface TokenPairResult {
    native: string
    wrapped?: string
}

export class CoinFinder {
    private static validateChain(chain: Chain) {
        if (!Object.values(Chain).includes(chain)) {
            throw new Error(`Invalid chain: ${chain}`)
        }
    }

    // TODO: Add more chains when we support them
    private static getChainKey(chain: Chain): string {
        this.validateChain(chain)

        switch (chain) {
            case Chain.SOLANA:
                return "sol"
            case Chain.MULTIVERSX:
                return "multiversx"
            case Chain.XRP:
                return "xrp"
            case Chain.TON:
                return "ton"
            case Chain.BITCOIN:
                return "btc"
            default:
                throw new Error(`Unsupported chain: ${chain}`)
        }
    }

    private static validateChainEnvironment(environment: ChainEnvironment) {
        if (
            ![ChainEnvironment.MAINNET, ChainEnvironment.TESTNET].includes(
                environment,
            )
        ) {
            throw new Error(`Invalid chain environment: ${environment}`)
        }
    }

    private static isValidAddress(address: string, chain: Chain): boolean {
        switch (chain) {
            case Chain.SOLANA:
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
            case Chain.MULTIVERSX:
                return /^[A-Z0-9]{6}-[a-f0-9]{6}$/.test(address)
            case Chain.XRP:
                return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)
            case Chain.BITCOIN:
                return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address)
            case Chain.TON:
                return /^[0-9A-Za-z_-]{48}$/.test(address)
            default:
                throw new Error(
                    `Address validation not implemented for chain: ${chain}`,
                )
        }
    }

    static async findNativeAssets(
        targetChains: Chain[],
        environment: ChainEnvironment = ChainEnvironment.MAINNET,
    ): Promise<Record<Chain, string>> {
        this.validateChainEnvironment(environment)

        const result: Record<Chain, string> = {} as Record<Chain, string>

        for (const chain of targetChains) {
            this.validateChain(chain)

            switch (chain) {
                case Chain.SOLANA:
                    result[chain] = tokenAddresses.sol[environment]
                    break
                case Chain.MULTIVERSX:
                    result[chain] = tokenAddresses.multiversx[environment]
                    break
                case Chain.XRP:
                    result[chain] = tokenAddresses.xrp[environment]
                    break
                case Chain.BITCOIN:
                    result[chain] = tokenAddresses.btc[environment]
                    break
                case Chain.TON:
                    result[chain] = tokenAddresses.ton[environment]
                    break
                default:
                    throw new Error(`Unsupported chain: ${chain}`)
            }
        }

        return result
    }

    static async findTokenPairs(
        tokenAddress: string,
        sourceChain: Chain,
        targetChains: Chain[],
        environment: ChainEnvironment = ChainEnvironment.MAINNET,
    ): Promise<Record<Chain, string | false>> {
        if (!this.isValidAddress(tokenAddress, sourceChain)) {
            throw new Error(`Invalid token address for ${sourceChain}`)
        }

        const result: Record<Chain, string | false> = {} as Record<
            Chain,
            string | false
        >
        const sourceChainKey = this.getChainKey(sourceChain)

        for (const targetChain of targetChains) {
            if (targetChain === sourceChain) {
                result[targetChain] = tokenAddress
                continue
            }

            // Check USDC mapping
            if (
                tokenAddress === tokenAddresses.usdc[sourceChain]?.[environment]
            ) {
                result[targetChain] =
                    tokenAddresses.usdc[targetChain]?.[environment] || false
                continue
            }

            // Check USDT mapping
            if (
                tokenAddress ===
                tokenAddresses.usdt[sourceChainKey]?.[environment]
            ) {
                result[targetChain] =
                    tokenAddresses.usdt[targetChain]?.[environment] || false
                continue
            }

            result[targetChain] = false
        }

        return result
    }
}
