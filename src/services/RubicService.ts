import Web3 from "web3"
import { WebsocketProvider } from "web3-core"
import {
    SDK,
    Configuration,
    BLOCKCHAIN_NAME,
    CrossChainManagerCalculationOptions,
    CHAIN_TYPE,
    WrappedCrossChainTrade,
    CrossChainTrade,
    SwapTransactionOptions,
} from "rubic-sdk"

const SUPPORTED_TOKENS = {
    [BLOCKCHAIN_NAME.ETHEREUM]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    [BLOCKCHAIN_NAME.POLYGON]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    },
    [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        USDT: "0x55d398326f99059fF775485246999027B3197955",
    },
    [BLOCKCHAIN_NAME.AVALANCHE]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    },
    [BLOCKCHAIN_NAME.OPTIMISM]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
        USDT: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    },
    [BLOCKCHAIN_NAME.ARBITRUM]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    [BLOCKCHAIN_NAME.LINEA]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
        USDT: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    },
    [BLOCKCHAIN_NAME.BASE]: {
        NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        USDT: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    },
    [BLOCKCHAIN_NAME.SOLANA]: {
        NATIVE: "So11111111111111111111111111111111111111112",
        USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    },
}

export const BRIDGE_PROTOCOLS = {
    ALL: "all",
    MULTICHAIN: "multichain",
    CELER: "celer",
    SYMBIOSIS: "symbiosis",
    AXELAR: "axelar",
    WORMHOLE: "wormhole",
} as const

interface ExtendedCrossChainManagerCalculationOptions
    extends CrossChainManagerCalculationOptions {
    bridgeTypes?: string[]
}

export type BlockchainName =
    (typeof BLOCKCHAIN_NAME)[keyof typeof BLOCKCHAIN_NAME]

export type BridgeProtocol = keyof typeof BRIDGE_PROTOCOLS

export class RubicService {
    private sdk: SDK
    private web3: Web3
    private selectedProtocol: BridgeProtocol = "ALL"

    constructor(privateKey: string) {
        const wsProvider = new Web3.providers.WebsocketProvider(
            "wss://eth.drpc.org",
        )
        this.web3 = new Web3(wsProvider)

        const formattedKey = privateKey.startsWith("0x")
            ? privateKey
            : `0x${privateKey}`

        const account = this.web3.eth.accounts.privateKeyToAccount(formattedKey)
        this.web3.eth.accounts.wallet.add(account)
        this.web3.eth.defaultAccount = account.address

        this.initializeSDK()
    }

    private async initializeSDK() {
        const walletAddress = this.web3.eth.defaultAccount as string
        const infuraKey = "" // Add Infura Key

        const configuration: Configuration = {
            rpcProviders: {
                [BLOCKCHAIN_NAME.ETHEREUM]: {
                    rpcList: ["https://eth.drpc.org"],
                },
                [BLOCKCHAIN_NAME.POLYGON]: {
                    rpcList: [
                        `wss://polygon-mainnet.infura.io/ws/v3/${infuraKey}`,
                        "https://polygon-rpc.com",
                    ],
                },
                [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: {
                    rpcList: ["https://bsc.publicnode.com"],
                },
                [BLOCKCHAIN_NAME.AVALANCHE]: {
                    rpcList: ["https://avalanche.public-rpc.com"],
                },
                [BLOCKCHAIN_NAME.OPTIMISM]: {
                    rpcList: ["https://optimism.llamarpc.com"],
                },
                [BLOCKCHAIN_NAME.ARBITRUM]: {
                    rpcList: ["https://arbitrum.llamarpc.com"],
                },
                [BLOCKCHAIN_NAME.LINEA]: {
                    rpcList: ["https://linea.drpc.org"],
                },
                [BLOCKCHAIN_NAME.BASE]: {
                    rpcList: ["https://base.drpc.org"],
                },
                [BLOCKCHAIN_NAME.SOLANA]: {
                    rpcList: ["https://api.mainnet-beta.solana.com"],
                },
            },
            providerAddress: {
                [CHAIN_TYPE.EVM]: {
                    crossChain: walletAddress,
                    onChain: walletAddress,
                },
            },
            walletProvider: {
                [CHAIN_TYPE.EVM]: {
                    core: this.web3
                        .currentProvider as unknown as WebsocketProvider,
                    address: walletAddress,
                },
            },
        }

        this.sdk = await SDK.createSDK(configuration)
    }

    getTokenAddress(
        chainId: number,
        symbol: "NATIVE" | "USDC" | "USDT",
    ): string {
        const blockchain = this.getBlockchainName(chainId)
        return SUPPORTED_TOKENS[blockchain][symbol]
    }

    async getTrade(
        fromToken: "NATIVE" | "USDC" | "USDT",
        toToken: "NATIVE" | "USDC" | "USDT",
        amount: string,
        fromChainId: number,
        toChainId: number,
    ): Promise<WrappedCrossChainTrade> {
        try {
            const fromTokenAddress = this.getTokenAddress(
                fromChainId,
                fromToken,
            )
            const toTokenAddress = this.getTokenAddress(toChainId, toToken)

            const trades = await this.sdk.crossChainManager.calculateTrade(
                {
                    address: fromTokenAddress,
                    blockchain: this.getBlockchainName(fromChainId),
                },
                amount,
                {
                    address: toTokenAddress,
                    blockchain: this.getBlockchainName(toChainId),
                },
                {
                    fromAddress: this.web3.eth.defaultAccount as string,
                    bridgeTypes:
                        this.selectedProtocol === "ALL"
                            ? Object.values(BRIDGE_PROTOCOLS)
                                  .filter(p => p !== "all")
                                  .map(p => p.toLowerCase())
                            : [this.selectedProtocol.toLowerCase()],
                } as ExtendedCrossChainManagerCalculationOptions,
            )

            const bestTrade = trades[0]

            return bestTrade
        } catch (error) {
            console.error("Error getting trade:", error)
            throw error
        }
    }

    async executeTrade(wrappedTrade: WrappedCrossChainTrade) {
        if (!wrappedTrade) throw new Error("Trade object is null or undefined")

        if (wrappedTrade.error) {
            console.error("Trade contains an error:", wrappedTrade.error)
            throw wrappedTrade.error
        }

        if (!wrappedTrade.trade)
            throw new Error("Invalid trade object: trade is null")

        const trade: CrossChainTrade = wrappedTrade.trade

        try {
            const signerAddress = this.web3.eth.defaultAccount as string
            this.sdk.updateWalletAddress(CHAIN_TYPE.EVM, signerAddress)

            const swapOptions: SwapTransactionOptions = {
                onConfirm: (hash: string) => {
                    console.log("Swap transaction confirmed:", hash)
                },
                onApprove: (hash: string | null) => {
                    console.log("Approval transaction:", hash)
                },
                receiverAddress: signerAddress,
                skipAmountCheck: false,
                useCacheData: false,
                testMode: false,
                useEip155: true,
                refundAddress: signerAddress,
            }

            const receipt = await trade.swap(swapOptions)

            return receipt
        } catch (error) {
            console.error("Error executing trade:", error)
            throw error
        }
    }

    getBlockchainName(chainId: number): BlockchainName {
        switch (chainId) {
            case 1:
                return BLOCKCHAIN_NAME.ETHEREUM
            case 137:
                return BLOCKCHAIN_NAME.POLYGON
            case 56:
                return BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN
            case 43114:
                return BLOCKCHAIN_NAME.AVALANCHE
            case 10:
                return BLOCKCHAIN_NAME.OPTIMISM
            case 42161:
                return BLOCKCHAIN_NAME.ARBITRUM
            case 59144:
                return BLOCKCHAIN_NAME.LINEA
            case 8453:
                return BLOCKCHAIN_NAME.BASE
            case 101:
                return BLOCKCHAIN_NAME.SOLANA
            default:
                throw new Error(`Unsupported chain ID: ${chainId}`)
        }
    }
}
