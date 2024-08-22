import { DefaultChain } from "./types/defaultChain"
import { JsonRpcProvider } from "near-api-js/lib/providers"
import {
    Account,
    InMemorySigner,
    KeyPair,
    Near,
    Signer,
    connect,
    keyStores,
    transactions,
} from "near-api-js"
import { InMemoryKeyStore } from "near-api-js/lib/key_stores"
import { IPayOptions } from "."
import { Transaction } from "near-api-js/lib/transaction"
import { _required as required } from "@/websdk"
import BigNumber from "bignumber.js"
import { base_decode } from "near-api-js/lib/utils/serialize"
import { baseDecode } from "@near-js/utils"

export class NEAR extends DefaultChain {
    override provider: Near
    override signer: any
    override wallet: KeyPair
    connection: Near

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "near"
    }

    async connect() {
        // this.provider = new JsonRpcProvider({
        //     url: "https://rpc.testnet.near.org",
        // })

        try {
            this.provider = await connect({
                networkId: "testnet",
                nodeUrl: this.rpc_url,
            })
            const status = await this.provider.connection.provider.status()
            this.connected = !!status
        } catch (error) {
            throw new Error(error as any)
        }

        return this.connected
    }

    override async connectWallet(privateKey: string, options?: {}) {
        // this.wallet = new InMemoryKeyStore()
        this.wallet = KeyPair.fromString(privateKey as any)
        return this.wallet

        // await this.wallet.setKey(
        //     "testnet",
        //     keypair.getPublicKey().toString(),
        //     keypair,
        // )

        // return this.wallet
    }

    // override preparePay(receiver: string, amount: string, options?: any) {

    // }

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
        console.log(lastBlockHash)

        const txs = payments.map(payment => {
            const amount = parseFloat(payment.amount as string)

            const tx = new Transaction({
                receiverId: payment.address,
                actions: [transactions.transfer(BigNumber(amount) as any)],
                nonce: currentNonce,
                signerId: accountId,
                blockHash: baseDecode(lastBlockHash),
                publicKey: this.wallet.getPublicKey(),
            })

            currentNonce = currentNonce + BigInt(1)
            return tx
        })

        return await this.signTransactions(txs)
    }

    async signTransactions(
        txs: Transaction[],
        options?: { privateKey?: string },
    ) {
        const accountId = "cwilvx.testnet" // Ensure this is the correct account ID
        // const signer = await InMemorySigner.fromKeyPair(
        //     "testnet",
        //     accountId,
        //     this.wallet,
        // )
        const signer = await InMemorySigner.fromKeyPair(
            "testnet",
            accountId,
            this.wallet,
        )

        console.log(signer.getPublicKey())

        return Promise.all(
            txs.map(async tx => {
                const res = await transactions.signTransaction(tx, signer, accountId, 'testnet')
                return res[0]
            }),
        )
    }
}

// NOTES:
// - We need to get the accountId from the publicKey
