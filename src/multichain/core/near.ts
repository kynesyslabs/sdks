import { DefaultChain } from "./types/defaultChain"
import {
    InMemorySigner,
    KeyPair,
    Near,
    connect,
    transactions as actions,
    Signer,
} from "near-api-js"
import { IPayOptions } from "."
import { Transaction } from "near-api-js/lib/transaction"
import { _required as required } from "@/websdk"
import { baseDecode, parseNearAmount } from "@near-js/utils"
import bigInt from "big-integer"

type networkId = "testnet" | "mainnet"

// @ts-expect-error
export class NEAR extends DefaultChain {
    networkId: networkId
    accountId: string
    override provider: Near
    override signer: Signer
    override wallet: KeyPair

    actions: typeof actions = actions

    constructor(rpc_url: string, networkId: networkId) {
        super(rpc_url)

        this.name = "near"
        this.networkId = networkId
    }

    static override async create<T extends NEAR>(
        this: new (rpc_url: string, networkId: networkId) => T,
        rpc_url: string,
        networkId: networkId,
    ): Promise<T> {
        const instance = new this(rpc_url, networkId)

        if (rpc_url) {
            await instance.connect()
        }

        return instance
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

    async connectWallet(
        privateKey: string,
        options: {
            /**
             * The accountId to use with this private key
             */
            accountId: string
        },
    ) {
        required(options && options.accountId, "AccountId is required")

        this.wallet = KeyPair.fromString(privateKey as any)
        this.accountId = options.accountId
        this.signer = await InMemorySigner.fromKeyPair(
            this.networkId,
            this.accountId,
            this.wallet,
        )
        return this.wallet
    }

    async preparePays(payments: IPayOptions[], options?: {}) {
        required(this.wallet, "Wallet not connected")
        required(this.accountId, "AccountId is required")

        const txs = payments.map(payment => {
            const parsed = parseNearAmount(payment.amount as string)
            const amount = parseFloat(parsed)

            const tx = new Transaction({
                receiverId: payment.address,
                actions: [actions.transfer(bigInt(amount) as any)],
                signerId: this.accountId,
                publicKey: this.wallet.getPublicKey(),
            })

            return tx
        })

        return await this.signTransactions(txs)
    }

    async signTransactions(
        txs: Transaction[],
        options?: { privateKey?: string },
    ) {
        required(this.signer, "Wallet not connected")
        required(this.accountId, "AccountId is required")

        const publicKey = this.wallet.getPublicKey().toString()
        const account = await this.provider.account(this.accountId)
        const info = await account.getAccessKeys()

        let currentNonce = info.find(key => key.public_key === publicKey)
            ?.access_key.nonce

        if (!currentNonce) {
            throw new Error(
                "Failed to get the account nonce for accountId: " +
                    this.accountId,
            )
        }

        const block = await this.provider.connection.provider.block({
            finality: "final",
        })
        const lastBlockHash = block.header.hash

        return Promise.all(
            txs.map(async tx => {
                currentNonce = bigInt(currentNonce).add(1) as any
                tx.nonce = currentNonce
                tx.blockHash = baseDecode(lastBlockHash)

                const res = await actions.signTransaction(
                    tx,
                    this.signer,
                    this.accountId,
                    this.networkId,
                )

                // INFO: The `signTransaction` method returns an array with the hash and the signed tx
                // We return the signed tx
                return res[1].encode()
            }),
        )
    }

    async preparePay(receiver: string, amount: string, options?: any) {
        const txs = await this.preparePays(
            [{ address: receiver, amount }],
            options,
        )
        return txs[0]
    }

    async signTransaction(tx: Transaction, options?: any) {
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    getEmptyTransaction() {
        required(this.accountId, "AccountId is required")
        required(this.wallet, "Wallet not connected")

        return new Transaction({
            receiverId: "",
            actions: [],
            nonce: null,
            signerId: this.accountId,
            blockHash: "",
            publicKey: this.wallet.getPublicKey(),
        })
    }

    /**
     * Create a new account
     * @param accountId The new accountId
     * @param amount The amount of Ⓝ to deposit to the new account
     * @param options Specify the curve to use when generating the key pair for the new account
     * @returns The signed transaction for creating the new account on Near, and its key pair
     */
    async createAccount(
        accountId: string,
        amount: string,
        options?: {
            curve?: "ed25519" | "secp256k1"
        },
    ) {
        const newAccountKey = KeyPair.fromRandom(options?.curve || "ed25519")

        const tx = this.getEmptyTransaction()
        tx.receiverId = accountId
        tx.actions = [
            actions.createAccount(),
            actions.transfer(bigInt(parseNearAmount(amount)) as any),
            actions.addKey(
                newAccountKey.getPublicKey(),
                actions.fullAccessKey(),
            ),
        ]
        const signedTx = await this.signTransaction(tx)

        return {
            signedTx,
            keyPair: newAccountKey,
        }
    }

    async deleteAccount(beneficiallyId: string) {
        const tx = this.getEmptyTransaction()
        tx.receiverId = beneficiallyId
        tx.actions = [actions.deleteAccount(beneficiallyId)]
        return await this.signTransaction(tx)
    }
}
