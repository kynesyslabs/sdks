import Web3 from "web3"
import { HttpProvider } from "web3-core"
import {
    SDK,
    Configuration,
    BLOCKCHAIN_NAME,
    CrossChainManagerCalculationOptions,
    CHAIN_TYPE,
    WrappedCrossChainTrade,
    CrossChainTrade,
    SwapTransactionOptions,
    RubicSdkError,
} from "rubic-sdk"
import { chainProviders } from "../chainProviders"
import { SUPPORTED_TOKENS } from "../supportedTokens"

class CustomEVMProvider {
    private httpProvider: HttpProvider
    private eventHandlers: Record<string, Function[]> = {}

    constructor(httpProvider: HttpProvider) {
        this.httpProvider = httpProvider
    }

    send(
        payload: any,
        callback: (error: Error | null, result?: any) => void,
    ): void {
        if (typeof this.httpProvider.send === "function") {
            this.httpProvider.send(payload, callback)
        } else {
            callback(new Error("Send method not available on provider"))
        }
    }

    disconnect(): void {
        // No-op implementation - HTTP providers don't need disconnection
        console.log("Disconnect called (no-op for HTTP provider)")
    }

    // Event emitter methods
    on(type: string, callback: Function): void {
        if (!this.eventHandlers[type]) {
            this.eventHandlers[type] = []
        }
        this.eventHandlers[type].push(callback)
        console.log(`Registered event handler for ${type}`)
    }

    removeListener(type: string, callback: Function): void {
        if (!this.eventHandlers[type]) return
        this.eventHandlers[type] = this.eventHandlers[type].filter(
            handler => handler !== callback,
        )
        console.log(`Removed event handler for ${type}`)
    }

    sendAsync(
        payload: any,
        callback: (error: Error | null, result?: any) => void,
    ): void {
        this.send(payload, callback)
    }

    request(args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.send(
                {
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: args.method,
                    params: args.params,
                },
                (error, response) => {
                    if (error) {
                        reject(error)
                    } else {
                        resolve(response?.result)
                    }
                },
            )
        })
    }
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
    private sdk: SDK | null = null
    private customEVMProvider: CustomEVMProvider
    private signer: any
    private initPromise: Promise<void> | null = null
    private selectedProtocol: BridgeProtocol = "ALL"

    constructor(privateKey: string, selectedProtocol: BridgeProtocol = "ALL") {
        this.selectedProtocol = selectedProtocol

        const web3Instance = new Web3(chainProviders.ETH.mainnet)

        const httpProvider =
            web3Instance.currentProvider as unknown as HttpProvider
        this.customEVMProvider = new CustomEVMProvider(httpProvider)

        const formattedKey = privateKey.startsWith("0x")
            ? privateKey
            : `0x${privateKey}`

        this.signer =
            web3Instance.eth.accounts.privateKeyToAccount(formattedKey)
        web3Instance.eth.accounts.wallet.add(this.signer)

        this.initPromise = this.initializeSDK()
    }

    private async initializeSDK(): Promise<void> {
        try {
            const walletAddress = this.signer.address

            const configuration: Configuration = {
                rpcProviders: {
                    [BLOCKCHAIN_NAME.ETHEREUM]: {
                        rpcList: [chainProviders.ETH.mainnet],
                    },
                    [BLOCKCHAIN_NAME.POLYGON]: {
                        rpcList: [chainProviders.POLYGON.mainnet],
                    },
                    [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: {
                        rpcList: [chainProviders.BSC.mainnet],
                    },
                    [BLOCKCHAIN_NAME.AVALANCHE]: {
                        rpcList: [chainProviders.AVALANCHE.mainnet],
                    },
                    [BLOCKCHAIN_NAME.OPTIMISM]: {
                        rpcList: [chainProviders.OPTIMISM.mainnet],
                    },
                    [BLOCKCHAIN_NAME.ARBITRUM]: {
                        rpcList: [chainProviders.ARBITRUM.mainnet],
                    },
                    [BLOCKCHAIN_NAME.LINEA]: {
                        rpcList: [chainProviders.LINEA.mainnet],
                    },
                    [BLOCKCHAIN_NAME.BASE]: {
                        rpcList: [chainProviders.BASE.mainnet],
                    },
                    [BLOCKCHAIN_NAME.SOLANA]: {
                        rpcList: [chainProviders.SOLANA.mainnet],
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
                        core: this.customEVMProvider,
                        address: walletAddress,
                    },
                },
            }

            this.sdk = await SDK.createSDK(configuration)
            console.log("SDK initialized successfully")
        } catch (error) {
            console.error("Error initializing SDK:", error)
            throw error
        }
    }

    public async waitForInitialization(): Promise<void> {
        return this.initPromise || Promise.resolve()
    }

    public getTokenAddress(
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
    ): Promise<WrappedCrossChainTrade | RubicSdkError> {
        await this.waitForInitialization()

        if (!this.sdk) {
            const error = new Error("SDK not initialized") as RubicSdkError

            return error
        }

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
                    fromAddress: this.signer.address,
                    bridgeTypes:
                        this.selectedProtocol === "ALL"
                            ? Object.values(BRIDGE_PROTOCOLS)
                                  .filter(p => p !== "all")
                                  .map(p => p.toLowerCase())
                            : [this.selectedProtocol.toLowerCase()],
                } as ExtendedCrossChainManagerCalculationOptions,
            )

            console.log(`Received ${trades.length} trade options`)

            if (trades.length === 0) {
                const error = new Error("No trades found") as RubicSdkError

                return error
            }

            const filteredTrades = trades.filter(
                trade => trade !== undefined && trade !== null,
            )

            const bestTrade = filteredTrades[0]

            return bestTrade
        } catch (error: any) {
            console.error("Error getting trade:", error)

            return error as RubicSdkError
        }
    }

    async executeTrade(wrappedTrade: WrappedCrossChainTrade) {
        if (!this.sdk) throw new Error("SDK not initialized")

        if (!wrappedTrade) throw new Error("Trade object is null or undefined")

        if (wrappedTrade.error) {
            console.error("Trade contains an error:", wrappedTrade.error)
            throw wrappedTrade.error
        }

        if (!wrappedTrade.trade)
            throw new Error("Invalid trade object: trade is null")

        const trade: CrossChainTrade = wrappedTrade.trade

        try {
            const signerAddress = this.signer.address
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
