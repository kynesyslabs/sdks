import { Address, Idl } from "@project-serum/anchor"
import { Contract, TransactionReceipt } from "ethers"
import {
    IBCConnectWalletOptions,
    IPayParams,
    SolanaReadAccountDataOptions,
    XmTransactionResponse,
} from "./interfaces"

export abstract class DefaultChain {
    provider: any = null
    name: string = ""
    signer: any = null
    wallet: any = null
    rpc_url: string = ""
    connected: boolean = false

    // NOTE We init chain with await CHAIN.create(rpc_url)
    // This is necessary to ensure that the provider is connected
    // if the user specifies the rpc_url in the constructor,
    // as we cannot use await in the constructor
    constructor(rpc_url: string) {
        this.setRpc(rpc_url)
    }

    // SECTION: Global methods

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
        rpc_url: string = "",
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

    /**
     * Creates a signed transaction to transfer default chain currency
     * @param receiver The receiver's address
     * @param amount The amount to transfer
     * @param options Options
     * @returns The signed transaction
     */
    prepareTransfer<
        T extends DefaultChain,
        Options extends Parameters<T["preparePays"]>[1],
    >(
        this: T,
        receiver: string,
        amount: string,
        options?: Options,
    ): Promise<Awaited<ReturnType<T["preparePays"]>>[number]> {
        return this.preparePay(receiver, amount, options)
    }

    /**
     * Creatthis.provider = new JsonRpcProvider(this.rpc_url)es a list of signed transactions to transfer default chain currency
     * @param payments A list of transfers to prepare
     * @param options Options
     * @returns An ordered list of signed transactions
     */
    prepareTransfers<
        T extends DefaultChain,
        Options extends Parameters<T["preparePays"]>[1],
    >(
        this: T,
        payments: IPayParams[],
        options?: Options,
    ): Promise<Awaited<ReturnType<T["preparePays"]>>> {
        // @ts-expect-error
        // INFO: Will throw error here because method is not implemented in this abstract class
        return this.preparePays(payments, options)
    }

    /**
     * Disconnects from the RPC provider and the wallet
     * @returns A boolean indicating if the disconnection was successful
     */
    async disconnect() {
        // INFO: Override when using a web sockets provider
        this.resetInstance()
        return !this.connected
    }

    // !SECTION Global methods

    // ANCHOR Base methods

    /**
     * Connects to the RPC provider
     * @returns A boolean indicating if the connection was successful
     */
    abstract connect(): Promise<boolean>

    /**
     * Connects to a wallet using a private key
     * @param privateKey The private key of the wallet
     * @returns The wallet object
     */
    abstract connectWallet(
        privateKey: string,
        options?: {},
    ): Promise<this["wallet"]>

    /**
     * Gets the balance of a wallet
     * @param address The wallet address
     * @param options Options
     * @returns The balance of the wallet as a string
     */
    abstract getBalance(address: string, options?: {}): Promise<string>

    /**
     * Creates a signed transaction to transfer default chain currency
     *
     * @param receiver The receiver's address
     * @param amount The amount to transfer
     * @param options Options
     * @returns The signed transaction
     *
     * @alias prepareTransfer
     */
    abstract preparePay<T extends DefaultChain>(
        this: T,
        receiver: string,
        amount: string,
        options?: any,
    ): Promise<Awaited<ReturnType<T["preparePays"]>>[number]>
    // INFO: The above typescript enforces:
    // Return type should be the same as the return type of the first element of preparePays

    /**
     * Creates a list of signed transactions to transfer default chain currency
     * @param payments A list of transfers to prepare
     * @param options Options
     * @returns An ordered list of signed transactions
     */
    abstract preparePays(payments: IPayParams[], options: {}): Promise<any[]>

    /**
     * Creates a skeleton transaction
     */
    abstract getEmptyTransaction(): any

    /**
     * Returns the address of the connected wallet
     */
    abstract getAddress(): string

    /**
     * Signs a message using the connected wallet
     * @param message The message to sign
     * @param options Options
     * @returns The signed message
     */
    abstract signMessage(message: string, options?: { privateKey?: string }): Promise<string| Uint8Array>

    /**
     * Verifies a message using the connected wallet
     * @param message The message to verify
     * @param signature The signature to verify
     * @returns A boolean indicating if the message was verified
     */
    abstract verifyMessage(message: string, signature: string|Uint8Array, publicKey: string|Uint8Array): Promise<boolean>

    /**
     * Signs a transaction using the connected wallet
     * @param tx The transaction to sign
     * @param options Options
     * @returns The signed transaction
     */

    abstract signTransaction<
        T extends DefaultChain,
        Tx extends Parameters<T["signTransactions"]>[0][number],
    >(
        this: T,
        tx: Tx,
        options?: any,
    ): Promise<Awaited<ReturnType<T["preparePays"]>>[number]>

    /**
     * Signs a list of transactions using the connected wallet. The transaction nonce is incremented for each transaction in order of appearance.
     *
     * @param transactions A list of transactions to sign
     * @param options Options
     */
    abstract signTransactions(
        transactions: any[],
        options?: { privateKey?: string },
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
     * @returns The status and transaction hash, or a (maybe) error object
     */
    sendTransaction: (signed_tx: any) => Promise<XmTransactionResponse>
}

// SECTION: Custom Extends to DefaultChain

/**
 * Extension methods for the EVM Default Chain SDK
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
        abi: any[],
    ) => Promise<any>
    listenForAllEvents: (contract: string, abi: any[]) => Promise<any>
    waitForReceipt: (tx_hash: string) => Promise<TransactionReceipt>
}

// SECTION
// ============ IBC ============

/**
 * Extension methods for IBC
 */
export interface IBCDefaultChain extends DefaultChain {
    connectWallet(
        privateKey: string,
        options: IBCConnectWalletOptions,
    ): Promise<any>
    ibcSend: () => Promise<any>
}

// SECTION
// ============ SOLANA ============

export interface SolanaDefaultChain extends DefaultChain {
    /**
     * Fetch the IDL from the network
     * @param programId The program address
     * @returns The IDL of the program
     */
    getProgramIdl: (programId: string) => Promise<Idl>

    /**
     * Fetch the deserialized account from the network
     * @param address The program address
     * @param options Options
     * @returns The account data
     */
    fetchAccount: (
        address: Address,
        options: SolanaReadAccountDataOptions,
    ) => Promise<any>
}
