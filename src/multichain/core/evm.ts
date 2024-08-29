import {
    Contract,
    JsonRpcProvider,
    TransactionRequest,
    Wallet,
    formatEther,
    parseEther,
    toNumber,
} from "ethers"
import { DefaultChain, IEVMDefaultChain } from "./types/defaultChain"
import { IPayParams } from "./types/interfaces"
import { required } from "./utils"

export class EVM extends DefaultChain implements IEVMDefaultChain {
    declare provider: JsonRpcProvider
    declare wallet: Wallet

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
    // REVIEW should private key be a string or a Buffer?
    async connectWallet(privateKey: string) {
        required(this.provider, "Provider not connected")
        this.wallet = new Wallet(privateKey, this.provider)

        return this.wallet
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

    async preparePay(address: string, amount: string) {
        const tx = await this.preparePays([{ address, amount }])
        return tx[0]
    }

    async preparePays(payments: IPayParams[]) {
        required(this.wallet, "Wallet not connected")

        const baseTx = await this.prepareBaseTxWithType()

        const txs = payments.map(payment => {
            const tx = {
                ...baseTx,
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
            gasLimit: 21000,
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

    async getBalance(address: string): Promise<string> {
        let balance_raw = await this.provider.getBalance(address)
        return formatEther(balance_raw)
    }

    // SECTION EVM Exclusive methods
    async createRawTransaction(tx_data: any): Promise<any> {
        throw new Error("Not implemented")
    }

    async waitForReceipt(tx_hash: string): Promise<any> {
        return await this.provider.getTransactionReceipt(tx_hash)
    }
    // SECTION Not implemented methods

    async getContractInstance(address: string, abi: string): Promise<Contract> {
        console.log(this)
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
    async writeToContract(
        contract_instance: Contract,
        function_name: string,
        args: any,
    ): Promise<any> {
        required(this.wallet)
        return await contract_instance[function_name](...args) // NOTE Ensure it is writeable i guess
    }

    // SECTION Event listener
    async listenForEvent(
        event: string,
        contract: string,
        abi: any[],
    ): Promise<any> {
        if (!this.provider) {
            throw new Error("Provider not connected")
        }
        let contractInstance = new Contract(contract, abi, this.provider)
        // REVIEW THis could work
        return contractInstance.on(event, (data: any) => {
            ////console.log(data)
            // TODO Do something with the data
        })
    }

    async listenForAllEvents(contract: string, abi: any[]): Promise<any> {
        if (!this.provider) {
            throw new Error("Provider not connected")
        }
        let contractInstance = new Contract(contract, abi, this.provider)
        // REVIEW 99% Won't work
        return contractInstance.on("*", (data: any) => {
            ////console.log(data)
            // TODO Do something with the data
        })
    }
}
