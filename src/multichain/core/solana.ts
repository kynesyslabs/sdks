import base58 from "bs58"
import {
    Keypair,
    PublicKey,
    Connection,
    SystemProgram,
    LAMPORTS_PER_SOL,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js"

import { required } from "./utils"
import { IPayOptions } from "./types/interfaces"
import { DefaultChain } from "./types/defaultChain"

/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

// LINK https://docs.solana.com/developing/clients/javascript-api

// INTERFACES (TO BE MOVED)
interface SignTxOptions {
    /**
     * The private key to sign the transaction with, instead of the connected wallet.
     */
    privateKey?: string
}

export class SOLANA extends DefaultChain {
    private static instance: SOLANA

    declare wallet: Keypair
    declare provider: Connection

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "solana"
    }

    async connect() {
        this.provider = new Connection(this.rpc_url, {
            confirmTransactionInitialTimeout: 5000,
        })

        const version = await this.provider.getVersion()
        this.connected = Number.isInteger(version["feature-set"])

        return this.connected
    }

    async disconnect() {
        this.resetInstance()
        return true
    }

    async createWallet() {
        const keypair = Keypair.generate()

        return {
            address: keypair.publicKey.toBase58(),
            secretKey: base58.encode(keypair.secretKey),
            keypair: keypair,
        }
    }
    // ANCHOR Public methods
    async connectWallet(privateKey: string) {
        const pkBuffer = base58.decode(privateKey)
        this.wallet = Keypair.fromSecretKey(pkBuffer)
        return this.wallet
    }

    async getBalance(address: string) {
        const publicKey = new PublicKey(address)
        const balance = await this.provider.getBalance(publicKey)
        return balance.toString()
    }

    async signTransaction(tx: VersionedTransaction, options?: SignTxOptions) {
        required(this.wallet, "Wallet not connected")
        // LINK https://docs.shyft.to/tutorials/how-to-sign-transactions-on-solana
        // NOTE Due to the above, the transaction is signed and sent at the same time.
        // tx.addSignature()
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    async signTransactions(
        transactions: VersionedTransaction[],
        options?: SignTxOptions,
    ) {
        required(
            this.wallet || (options && options.privateKey),
            "Wallet not connected",
        )
        let signers = [this.wallet]

        if (options && options.privateKey) {
            const privateKeyBuffer = base58.decode(options.privateKey)
            const keypair = Keypair.fromSecretKey(privateKeyBuffer)
            signers = [keypair]
        }

        return transactions.map(tx => {
            tx.sign(signers)
            return tx.serialize()
        })
    }

    getAddress() {
        required(this.wallet, "Wallet not connected")
        return this.wallet.publicKey.toBase58()
    }

    getEmptyTransaction() {
        const vmsg = new TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: "",
            instructions: [],
        }).compileToV0Message()

        return new VersionedTransaction(vmsg)
    }

    async preparePay(
        receiver: string,
        amount: string,
        options?: SignTxOptions,
    ) {
        const tx = await this.preparePays(
            [{ address: receiver, amount }],
            options,
        )
        return tx[0]
    }

    async preparePays(payments: IPayOptions[], options?: SignTxOptions) {
        const blockInfo = await this.provider.getLatestBlockhash()

        const transactions = payments.map(payment => {
            // create a transfer instruction
            const transferIx = SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: new PublicKey(payment.address),
                lamports:
                    parseFloat(payment.amount as string) * LAMPORTS_PER_SOL,
            })

            // compile the instruction into a message
            const vmsg = new TransactionMessage({
                instructions: [transferIx],
                payerKey: this.wallet.publicKey,
                recentBlockhash: blockInfo.blockhash,
            }).compileToV0Message()

            // create a versioned transaction
            return new VersionedTransaction(vmsg)
        })

        // sign the transactions
        return this.signTransactions(transactions, options)
    }

    async prepareTransfer(
        receiver: string,
        amount: string,
        options?: SignTxOptions,
    ) {
        return await this.preparePay(receiver, amount, options)
    }

    async prepareTransfers(transfers: IPayOptions[], options?: SignTxOptions) {
        return await this.preparePays(transfers, options)
    }

    static getInstance(): SOLANA | boolean {
        if (!SOLANA.instance) {
            return false
        }
        return SOLANA.instance
    }

    static createInstance(rpc_url: string): SOLANA {
        if (!SOLANA.instance) {
            SOLANA.instance = new SOLANA(rpc_url)
        }
        return SOLANA.instance
    }
}
