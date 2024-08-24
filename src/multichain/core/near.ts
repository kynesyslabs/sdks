import { DefaultChain } from "./types/defaultChain"
import { JsonRpcProvider } from "near-api-js/lib/providers"
import {
    InMemorySigner,
    KeyPair,
    Near,
    connect,
    transactions,
} from "near-api-js"
import { IPayOptions } from "."
import { Transaction } from "near-api-js/lib/transaction"
import { _required as required } from "@/websdk"
import BigNumber from "bignumber.js"
import { baseDecode, parseNearAmount } from "@near-js/utils"

type networkId = "testnet" | "mainnet"

// @ts-expect-error
export class NEAR extends DefaultChain {
    networkId: networkId
    accountId: string

    override provider: Near
    override signer: any
    override wallet: KeyPair
    connection: Near

    constructor(rpc_url: string, networkId: networkId) {
        super(rpc_url)

        this.name = "near"
        this.networkId = networkId
    }

    static override async create<T extends NEAR>(
        this: new (rpc_url: string, networkId: networkId) => T,
        rpc_url: string,
        networkId: networkId
    ): Promise<T> {
        const instance = new this(rpc_url, networkId);
        
        if (rpc_url) {
            await instance.connect();
        }

        return instance;
    }

    async connect() {
        // const provider = new JsonRpcProvider({
        //     url: this.rpc_url,
        // })


        try {
            this.provider = await connect({
                networkId: this.networkId,
                nodeUrl: this.rpc_url,
            })
            const status = await this.provider.connection.provider.status()
            this.connected = !!status
        } catch (error) {
            throw new Error(error as any)
        }

        return this.connected
    }

    getAddress(): string {
        return this.wallet.getPublicKey().toString()
    }

    async getBalance(address: string, options?: {}) {
        const account = await this.provider.account(address)
        const balance = await account.getAccountBalance()
        return balance.total
    }

    async connectWallet(privateKey: string, options: {
        /**
         * The accountId to use with this private key
         */
        accountId: string
    }) {
        required(options && options.accountId, "AccountId is required")

        this.wallet = KeyPair.fromString(privateKey as any)
        this.accountId = options.accountId
        return this.wallet
    }

    async preparePays(payments: IPayOptions[], options?: {}) {
        required(this.wallet, "Wallet not connected")
        const accountId = "cwilvx.testnet"

        const publicKey = this.wallet.getPublicKey().toString()
        const account = await this.provider.account(accountId)
        const info = await account.getAccessKeys()

        let currentNonce = info.find(key => key.public_key === publicKey)
            ?.access_key.nonce

        if (!currentNonce) {
            throw new Error(
                "Failed to get the account nonce for accountId: " + accountId,
            )
        }

        const block = await this.provider.connection.provider.block({
            finality: "final",
        })
        const lastBlockHash = block.header.hash

        const txs = payments.map(payment => {
            currentNonce = currentNonce + BigInt(1)
            const parsed = parseNearAmount(payment.amount as string)
            const amount = parseFloat(parsed)

            const tx = new Transaction({
                receiverId: payment.address,
                actions: [transactions.transfer(BigNumber(amount) as any)],
                nonce: currentNonce,
                signerId: accountId,
                blockHash: baseDecode(lastBlockHash),
                publicKey: this.wallet.getPublicKey(),
            })

            return tx
        })

        return await this.signTransactions(txs)
    }

    async preparePay(receiver: string, amount: string, options?: any) {
        const txs = await this.preparePays([{ address: receiver, amount }], options)
        return txs[0]
    }

    async signTransactions(
        txs: Transaction[],
        options?: { privateKey?: string },
    ) {
        const accountId = "cwilvx.testnet"
        const signer = await InMemorySigner.fromKeyPair(
            this.networkId,
            accountId,
            this.wallet,
        )

        return Promise.all(
            txs.map(async tx => {
                const res = await transactions.signTransaction(tx, signer, accountId, this.networkId)
                return res[1].encode()
            }),
        )
    }

    async signTransaction(tx: Transaction, options?: any) {
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    getEmptyTransaction() {
        return new Transaction({
            receiverId: "",
            actions: [],
            nonce: null,
            signerId: "",
            blockHash: "",
            publicKey: this.wallet.getPublicKey(),
        })
    }

    /**
     * Create a new account
     * @param accountId The new accountId
     * @param options 
     * @returns 
     */
    async createAccount(accountId: string, options?: {
        /**
         * The amount of NEAR to transfer to the new account. Default is 1Ⓝ
         */
        amount?: string
    }) {
        const account = await this.provider.account(this.accountId)
        console.log(account)
        const res = await account.createAccount(
            "other.cwilvx.testnet",
            "ed25519:829U4DTgQqdhxZX71Evh3GrPxjvi2azut1H6kLV1utu6",
            BigInt(parseNearAmount(options?.amount || "1")),
        )

        return res
    }
}

// NOTES:
// - We need to get the accountId from the publicKey
