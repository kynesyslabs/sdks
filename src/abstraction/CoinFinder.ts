import { tokenAddresses } from "./providers/CoinAddresses"

export enum Chain {
    SOLANA = "solana",
    MULTIVERSX = "multiversx",
    XRP = "xrp",
    BITCOIN = "bitcoin",
    TON = "ton",
}

export class CoinFinder {
    private static validateChain(chain: Chain) {
        if (!Object.values(Chain).includes(chain)) {
            throw new Error(`Invalid chain: ${chain}`)
        }
    }

    static async findSol(targetChain: string): Promise<string | false> {
        this.validateChain(Chain.SOLANA)
        return tokenAddresses.sol.wrapped?.[targetChain]?.mainnet || false
    }

    static async findMultiversx(targetChain: string): Promise<string | false> {
        this.validateChain(Chain.MULTIVERSX)
        return (
            tokenAddresses.multiversx.wrapped?.[targetChain]?.mainnet || false
        )
    }

    static async findXRP(targetChain: string): Promise<string | false> {
        this.validateChain(Chain.XRP)
        return tokenAddresses.xrp.wrapped?.[targetChain]?.mainnet || false
    }

    static async findBTC(targetChain: string): Promise<string | false> {
        this.validateChain(Chain.BITCOIN)
        return tokenAddresses.btc.wrapped?.[targetChain]?.mainnet || false
    }
}
