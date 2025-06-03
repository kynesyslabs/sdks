import * as web3 from "web3"

import { FeeMarketEIP1559TxData } from "web3-eth-accounts"
import { DefaultChain } from "./types/defaultChain"
import { IPayParams } from "./types/interfaces"
import { required } from "./utils"
import { toNumber, toWei } from "web3-utils"

export class TEN extends DefaultChain {
    chainId: number
    override provider: web3.Web3Eth
    override signer: web3.eth.accounts.Web3Account

    constructor(rpc_url: string) {
        super(rpc_url)
    }

    async connect() {
        this.provider = new web3.Web3Eth(this.rpc_url)

        try {
            const chainId = await this.provider.getChainId()
            this.chainId = parseInt(chainId.toString())
            this.connected = typeof this.chainId === "number"
        } catch (error) {
            this.connected = false
        }

        return this.connected
    }

    async connectWallet(privateKey: string) {
        // REVIEW: Should we add 0x prefix to privateKey if not present?
        privateKey = privateKey.startsWith("0x")
            ? privateKey
            : "0x" + privateKey
        this.signer = web3.eth.accounts.privateKeyToAccount(privateKey)

        return this.signer
    }

    getAddress() {
        required(this.signer, "Wallet not connected")
        return this.signer.address
    }

    override async signMessage(message: string, options?: { privateKey?: string }): Promise<string> {
        required(this.signer || options?.privateKey, "Wallet not connected")
        // TODO Implement the signMessage method
        return "Not implemented"
    }

    override async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
        // TODO Implement the verifyMessage method
        return false
    }

    // SECTION: Transactions

    async signTransactions(
        txs: FeeMarketEIP1559TxData[],
        options?: { privateKey?: string },
    ) {
        required(this.signer || options?.privateKey, "Wallet not connected")

        let signer = this.signer
        if (options?.privateKey) {
            signer = web3.eth.accounts.privateKeyToAccount(options.privateKey)
        }

        // INFO: Get account nonce
        const nonce = await this.provider.getTransactionCount(
            signer.address,
            "pending",
        )
        console.log("ledger nonce: ", nonce)

        //INFO: Max safe integer: 9007199254740991
        // @ts-expect-error
        let currentNonce = toNumber(nonce) as number

        return Promise.all(
            txs.map(async txData => {
                txData.nonce = currentNonce
                // INFO: Increment the nonce for the next transaction
                currentNonce++

                console.log(txData)
                const tx =
                    web3.eth.accounts.FeeMarketEIP1559Transaction.fromTxData(
                        txData,
                    )
                console.log(tx)

                return web3.eth.accounts.signTransaction(tx, signer.privateKey)
            }),
        )
    }


    async signTransaction(tx: any, options?: { privateKey?: string }) {
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    async prepareBaseTransaction() {
        const feeData = await this.provider.calculateFeeData()
        console.log(feeData)

        return {
            gasLimit: 21000,
            chainId: this.chainId,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        }
    }

    async preparePays(payments: IPayParams[]) {
        const baseTx = await this.prepareBaseTransaction()

        const txs = payments.map(payment => {
            return {
                ...baseTx,
                // from: this.getAddress(),
                to: payment.address,
                // @ts-expect-error
                value: toNumber(toWei(payment.amount, "ether")),
            }
        })

        return await this.signTransactions(txs)
    }

    async preparePay(address: string, amount: string) {
        const tx = await this.preparePays([{ address, amount }])
        return tx[0]
    }

    async getBalance(address: string) {
        const balance = await this.provider.getBalance(address)
        // @ts-expect-error
        return toNumber(balance).toString()
    }

    getEmptyTransaction() {
        return this.prepareBaseTransaction()
    }
}
