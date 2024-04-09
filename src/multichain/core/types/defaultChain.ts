import { Contract, TransactionReceipt } from 'ethers'
import { IBCConnectWalletOptions, IPayOptions } from './interfaces'

export abstract class DefaultChain {
    provider: any = null
    name: string = ''
    signer: any = null
    wallet: any = null
    rpc_url: string = ''
    connected: boolean = false

    // NOTE We init chain with await CHAIN.create(rpc_url)
    // This is necessary to ensure that the provider is connected
    // if the user specifies the rpc_url in the constructor,
    // as we cannot use await in the constructor
    constructor(rpc_url: string) {
        this.setRpc(rpc_url)
    }

    /**
     * Sets the RPC URL only. Use `await instance.connect()` to connect to the rpc provider
     * @param rpc_url
     */
    setRpc(rpc_url: string) {
        this.rpc_url = rpc_url
    }

    /**
     * Creates a new instance of this sdk
     * @param rpc_url The RPC URL
     * @returns The sdk instance connected to the RPC provider
     */
    static async create<T extends DefaultChain>(
        this: new (rpc_url: string) => T,
        rpc_url: string = ''
    ): Promise<T> {
        const instance = new this(rpc_url)
        instance.setRpc(rpc_url)

        if (rpc_url) {
            await instance.connect()
        }

        return instance
    }

    /**
     * Resets the instance provider, wallet and rpc_url
     */
    protected resetInstance() {
        this.provider = null
        this.wallet = null
        this.signer = null
        this.connected = false
    }

    // ANCHOR Base methods

    /**
     * Connects to the RPC provider
     * @returns A boolean indicating if the connection was successful
     */
    abstract connect(): Promise<boolean>

    /**
     * Disconnects from the RPC provider and the wallet
     * @returns A boolean indicating if the disconnection was successful
     */
    abstract disconnect(): Promise<boolean>

    /**
     * Connects to a wallet using a private key
     * @param privateKey The private key of the wallet
     * @returns The wallet object
     */
    abstract connectWallet(privateKey: string, options?: {}): Promise<any>

    /**
     * Gets the balance of a wallet
     * @param address The wallet address
     * @param options Options
     * @returns The balance of the wallet as a string
     */
    abstract getBalance(address: string, options?: {}): Promise<string>

    // SECTION: These two methods are for compatibility

    /**
     * Creates a signed transaction to transfer default chain currency
     * @param receiver The receiver's address
     * @param amount The amount to transfer
     * @param options Options
     * @returns The signed transaction
     */
    abstract preparePay(
        receiver: string,
        amount: string,
        options: {}
    ): Promise<any>

    /**
     * Creates a signed transaction to transfer default chain currency
     * @param receiver The receiver's address
     * @param amount The amount to transfer
     * @param options Options
     * @returns The signed transaction
     */
    abstract prepareTransfer(
        receiver: string,
        amount: string,
        options: {}
    ): Promise<any>

    /**
     * Creates a list of signed transactions to transfer default chain currency
     * @param payments A list of transfers to prepare
     * @param options Options
     * @returns An ordered list of signed transactions
     */
    abstract preparePays(payments: IPayOptions[], options: {}): Promise<any[]>

    /**
     * Creates a list of signed transactions to transfer default chain currency
     * @param payments A list of transfers to prepare
     * @param options Options
     * @returns An ordered list of signed transactions
     */
    abstract prepareTransfers(
        payments: IPayOptions[],
        options: {}
    ): Promise<any[]>

    /**
     * Creates a skeleton transaction
     */
    abstract getEmptyTransaction(): any

    /**
     * Returns the address of the connected wallet
     */
    abstract getAddress(): string

    /**
     * Signs a transaction using the connected wallet
     * @param raw_transaction The transaction to sign
     * @param options Options
     * @returns The signed transaction
     */
    abstract signTransaction(
        raw_transaction: any,
        options?: { privateKey?: string }
    ): Promise<any>

    /**
     * Signs a list of transactions using the connected wallet. The transaction nonce is incremented for each transaction in order of appearance.
     *
     * @param transactions A list of transactions to sign
     * @param options Options
     */
    abstract signTransactions(
        transactions: any[],
        options?: { privateKey?: string }
    ): Promise<any[]>
}

/**
 * Interface for web sdk exclusive methods
 */
export interface IDefaultChainWeb extends DefaultChain {
    // nothing here at the moment
}

/**
 * Interface for local sdk exclusive methods
 */
export interface IDefaultChainLocal extends DefaultChain {
    /**
     * Gets various infos
     */
    getInfo: () => Promise<any>

    /**
     * Creates a new wallet
     * @param password The password to encrypt the wallet
     */
    createWallet: (password: string) => Promise<any>

    /**
     * Broadcasts a signed transaction
     * @param tx The signed transaction
     * @returns The transaction hash
     */
    sendTransaction: (signed_tx: any) => Promise<any>
}


/**
 * Base methods for the EVM Default Chain SDK
 */
export interface IEVMDefaultChain {
    contracts: Map<string, Contract>
    isEIP1559: boolean
    chainId: number

    prepareBaseTxWithType: () => Promise<any>
    getContractInstance: (address: string, abi: string) => Promise<Contract>
    createRawTransaction: (tx_data: any) => Promise<any>
    readFromContract: (contract: any, method: string, args: any) => Promise<any>
    writeToContract: (contract: any, method: string, args: any) => Promise<any>
    listenForEvent: (
        event: string,
        contract: string,
        abi: any[]
    ) => Promise<any>
    listenForAllEvents: (contract: string, abi: any[]) => Promise<any>
    waitForReceipt: (tx_hash: string) => Promise<TransactionReceipt>
}


export interface IBCDefaultChain extends DefaultChain {
    connectWallet(
        privateKey: string,
        options: IBCConnectWalletOptions
    ): Promise<any>
    ibcSend: () => Promise<any>
}