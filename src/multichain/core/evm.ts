import {
    Contract,
    HDNodeWallet,
    JsonRpcProvider,
    TransactionRequest,
    Wallet,
    formatEther,
    isAddress,
    parseEther,
    toNumber,
    verifyMessage,
    parseUnits,
    TransactionReceipt
} from "ethers"
import { DefaultChain, IEVMDefaultChain } from "./types/defaultChain"
import { IPayParams } from "./types/interfaces"
import { required } from "./utils"
import * as bip39 from "bip39"

const ERC20_ABI = [
    {
        constant: true,
        inputs: [],
        name: "name",
        outputs: [{ name: "", type: "string" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            { name: "src", type: "address" },
            { name: "dst", type: "address" },
            { name: "wad", type: "uint256" },
        ],
        name: "transferFrom",
        outputs: [{ name: "", type: "bool" }],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: false,
        inputs: [{ name: "wad", type: "uint256" }],
        name: "withdraw",
        outputs: [],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [{ name: "", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [{ name: "", type: "string" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            { name: "dst", type: "address" },
            { name: "wad", type: "uint256" },
        ],
        name: "transfer",
        outputs: [{ name: "", type: "bool" }],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: false,
        inputs: [],
        name: "deposit",
        outputs: [],
        payable: true,
        stateMutability: "payable",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            { name: "", type: "address" },
            { name: "", type: "address" },
        ],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    { payable: true, stateMutability: "payable", type: "fallback" },
]

export class EVM extends DefaultChain implements IEVMDefaultChain {
    declare provider: JsonRpcProvider
    declare wallet: Wallet | HDNodeWallet

    contracts: Map<string, Contract> = new Map()
    isEIP1559: boolean
    chainId: number

    constructor(rpc_url: string, chainId?: number, isEIP1559?: boolean) {
        super(rpc_url)
        this.name = "evm"

        this.chainId = chainId
        this.isEIP1559 = isEIP1559
    }

    override setRpc(rpc_url: string): void {
        // NOTE: We override here because we need to create a new provider
        this.rpc_url = rpc_url
        this.provider = new JsonRpcProvider(this.rpc_url)
    }

    /**
     * Connects to the EVM network
     *
     * @param chainId (Optional) The chainId of this network
     * @param isEIP1559 (Optional) Whether this network uses EIP-1559
     * @returns A boolean indicating whether the connection was successful
     *
     * When parameters are not provided, they are automatically inferred from the network.
     */
    async connect(chainId?: number, isEIP1559?: boolean) {
        if (chainId) {
            this.chainId = chainId
        }

        if (isEIP1559) {
            this.isEIP1559 = isEIP1559
        }

        try {
            const network = await this.provider.getNetwork()
            this.chainId = toNumber(network.chainId)
            this.connected = this.chainId > 0
        } catch (error) {
            console.error(error)
            this.connected = false
        }

        return this.connected
    }

    // INFO Connecting a wallet through a private key (string)
    async connectWallet(privateKey: string) {
        if (!this.rpc_url) {
            console.warn(
                "WARNING: No RPC URL set. Connecting wallet without provider",
            )
        }
        privateKey = privateKey.trim()

        if (bip39.validateMnemonic(privateKey)) {
            this.wallet = Wallet.fromPhrase(privateKey)
        } else {
            this.wallet = new Wallet(
                privateKey,
                this.rpc_url ? this.provider : null,
            )
        }

        return this.wallet
    }

    // INFO Signing a message
    async signMessage(
        message: string,
        options?: { privateKey?: string },
    ): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")
        let wallet = this.wallet
        if (options?.privateKey) {
            wallet = new Wallet(options.privateKey, this.provider)
        }

        return wallet.signMessage(message)
    }

    // INFO Verifying a message
    override async verifyMessage(
        message: string,
        signature: string,
        publicKey: string,
    ): Promise<boolean> {
        let recoveredAddress = verifyMessage(message, signature)
        return recoveredAddress === publicKey
    }

    // INFO Signing a transaction
    // with a private key or by using our stored wallet
    // REVIEW should private key be a string or a Buffer?
    async signTransaction(
        transaction: TransactionRequest,
        options?: {
            privateKey?: string
        },
    ) {
        const txs = await this.signTransactions([transaction], options)

        return txs[0]
    }

    async signTransactions(
        transactions: TransactionRequest[],
        options?: {
            privateKey?: string
        },
    ) {
        required(this.wallet || options?.privateKey, "Wallet not connected")

        if (options?.privateKey) {
            this.wallet = new Wallet(options.privateKey, this.provider)
        }

        // INFO: Get the current nonce
        const this_address = this.getAddress()
        let currentNonce = await this.provider.getTransactionCount(this_address)

        // INFO: Return a list of signed transactions
        return Promise.all(
            transactions.map(async tx => {
                tx.nonce = currentNonce

                // INFO: Increment the nonce for the next transaction
                currentNonce++
                return this.wallet.signTransaction(tx)
            }),
        )
    }

    // SECTION Specific methods

    // REVIEW Should prepare methods be like:
    // prepare = { pay(), send(), ...}

    async preparePay(
        address: string,
        amount: string,
        options?: { gasLimit?: number },
    ) {
        const tx = await this.preparePays([{ address, amount }], options)
        return tx[0]
    }

    async preparePays(payments: IPayParams[], options?: { gasLimit?: number }) {
        required(this.wallet, "Wallet not connected")

        const baseTx = await this.prepareBaseTxWithType()

        const txs = payments.map(payment => {
            const tx = {
                ...baseTx,
                ...(options?.gasLimit && { gasLimit: options.gasLimit }),
                to: payment.address,
                value: parseEther(payment.amount as string),
            }

            // INFO: wallet.checkTransaction was removed in ethers v6
            // const checkedTx = this.wallet.checkTransaction(tx);
            // console.log('checked', checkedTx);

            return tx
        })

        return this.signTransactions(txs)
    }

    // SECTION EVM Specific methods
    // INFO Generic transaction skeleton for both EIP-1559 and legacy chains
    async prepareBaseTxWithType() {
        const feeData = await this.provider.getFeeData()
        // INFO: Check if the chain uses EIP-1559
        // If the user has set the isEIP1559 flag, use it
        const isEIP1559 = this.isEIP1559 || feeData.maxFeePerGas !== null

        const baseTx = {
            gasLimit: 30000,
            chainId: this.chainId,
        }

        if (isEIP1559) {
            return {
                ...baseTx,
                type: 2,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            }
        }

        // INFO: Legacy chains use a gasPrice
        return {
            ...baseTx,
            gasPrice: feeData.gasPrice,
        }
    }

    // INFO Generic empty tx skeleton for this chain
    async getEmptyTransaction() {
        // NOTE This is a redirection to the prepareBaseTxWithType method as in a evm chain is like that
        return await this.prepareBaseTxWithType()
    }

    // megabudino was here – return the address of the wallet
    getAddress() {
        return this.wallet.address
    }

    /**
     * Check if an address is valid
     *
     * @param address The address to check
     * @returns A boolean indicating whether the address is valid
     */
    isAddress(address: string): boolean {
        return isAddress(address)
    }

    async getBalance(address: string): Promise<string> {
        let balance_raw = await this.provider.getBalance(address)
        return formatEther(balance_raw)
    }

    /**
     * Get the balance of a token
     *
     * @param contract_address The address of the token contract
     * @param address The address of the wallet
     * @returns The balance of the token
     */
    async getTokenBalance(
        contract_address: string,
        address: string,
    ): Promise<{
        name: string
        symbol: string
        decimals: number
        balance: string
    }> {
        let contract = await this.getContractInstance(
            contract_address,
            JSON.stringify(ERC20_ABI),
        )

        const fields = ["name", "symbol", "decimals"]
        const promises = fields.map(field =>
            this.readFromContract(contract, field, []),
        )
        promises.push(contract.balanceOf(address))

        const [name, symbol, decimals, balance] = await Promise.all(promises)
        return {
            name,
            symbol,
            decimals,
            balance,
        }
    }

    // SECTION EVM Exclusive methods
    async createRawTransaction(tx_data: any): Promise<any> {
        throw new Error("Not implemented")
    }

    async waitForReceipt(tx_hash: string): Promise<TransactionReceipt | null> {
        return await this.provider.waitForTransaction(tx_hash)
    }
    // SECTION Not implemented methods

    async getContractInstance(address: string, abi: string): Promise<Contract> {
        if (!this.provider) {
            throw new Error("Provider not connected")
        }
        let contract = new Contract(address, abi, this.provider)
        return contract
    }

    // REVIEW Reader for contracts
    // ANCHOR MVP
    async readFromContract(
        contract_instance: Contract,
        function_name: string,
        args: any,
    ): Promise<any> {
        return await contract_instance[function_name](...args)
    }

    // REVIEW Writer for contracts
    // REVIEW: Updated to properly prepare and sign transactions for node execution
    async writeToContract(
        contract_instance: Contract,
        function_name: string,
        args: any[],
        options?: { gasLimit?: number; value?: string, gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number }
    ): Promise<string> {
        required(this.wallet, "Wallet not connected")

        // Connect wallet to contract for signing capability
        const contractWithSigner = contract_instance.connect(this.wallet)

        // Prepare transaction options
        const txOptions: any = {}
        if (options?.gasLimit) {
            txOptions.gasLimit = options.gasLimit
        }
        if (options?.value) {
            txOptions.value = parseEther(options.value)
        }

        // Get nonce
        const nonce = await this.provider.getTransactionCount(this.wallet.address)

        // Get populated transaction without executing
        const populatedTx = await contractWithSigner[function_name].populateTransaction(...args, txOptions)

        // Ensure transaction has required fields
        if (!populatedTx.chainId) {
            populatedTx.chainId = this.chainId
        }

        // Get base transaction data (gas pricing, etc.)
        const baseTx = await this.prepareBaseTxWithType()

        // Merge base transaction data with populated transaction
        const finalTx = {
            nonce,
            ...(options?.gasPrice && { gasPrice: options.gasPrice }),
            ...(options?.maxFeePerGas && { maxFeePerGas: options.maxFeePerGas }),
            ...(options?.maxPriorityFeePerGas && { maxPriorityFeePerGas: options.maxPriorityFeePerGas }),
            ...baseTx,
            ...populatedTx,
            // Override gasLimit if provided in options
            ...(options?.gasLimit && { gasLimit: options.gasLimit })
        }

        // Sign the transaction for node execution
        return await this.wallet.signTransaction(finalTx)
    }

    // SECTION Event listener
    async listenForEvent(
        event: string,
        contract: string,
        abi: any[],
        callback: (data: any) => Promise<any>
    ): Promise<any> {
        if (!this.provider) {
            throw new Error("Provider not connected")
        }
        let contractInstance = new Contract(contract, abi, this.provider)
        // REVIEW THis could work
        return contractInstance.on(event, (data: any) => callback(data))
    }

    async listenForAllEvents(contract: string, abi: any[], callback: (data: any) => Promise<any>): Promise<any> {
        if (!this.provider) {
            throw new Error("Provider not connected")
        }
        let contractInstance = new Contract(contract, abi, this.provider)
        return contractInstance.on("*", (data: any) => callback(data))
    }
}
