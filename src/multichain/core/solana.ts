import bs58 from "bs58"
import {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    NonceAccount,
    SystemProgram,
    LAMPORTS_PER_SOL,
    TransactionNonceCtor,
    NONCE_ACCOUNT_LENGTH,
    TransactionInstruction,
} from "@solana/web3.js"

import { required } from "./utils"
import { IPayOptions } from "./types/interfaces"
import { DefaultChain, SolanaDefaultChain } from "./types/defaultChain"

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
    /**
     * The address of your nonce account for signing with durable nonces.
     */
    nonceAccountAddress?: string

    /**
     * The secret key of the nonce account authority, for signing the tx.
     *
     * Defaults to the connected wallet's secret key.
     */
    nonceAccountAuthority?: string
}

export class SOLANA extends DefaultChain implements SolanaDefaultChain {
    private static instance: SOLANA

    declare wallet: Keypair
    declare provider: Connection

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "solana"
    }

    async connect() {
        this.provider = new Connection(this.rpc_url)

        const version = await this.provider.getVersion()
        this.connected = Number.isInteger(version["feature-set"])

        return this.connected
    }

    async disconnect() {
        this.resetInstance()
        return true
    }

    // async createWallet() {}

    // ANCHOR Public methods
    async connectWallet(
        privateKey: string,
        options?: {
            /**
             * If the private key is in base58 format
             */
            base58: boolean
        },
    ) {
        let privateKeyBuffer: Uint8Array

        if (options && options.base58) {
            privateKeyBuffer = bs58.decode(privateKey)
        } else {
            const pk = privateKey.split(",").map(x => parseInt(x))
            privateKeyBuffer = Buffer.from(pk)
        }

        this.wallet = Keypair.fromSecretKey(privateKeyBuffer)
        return this.wallet
    }

    async getBalance(address: string) {
        const publicKey = new PublicKey(address)
        const balance = await this.provider.getBalance(publicKey)
        return balance.toString()
    }

    // async pay(to: string, amount: string): Promise<any> {
    //     required(this.wallet, 'Wallet not connected')
    //     // TODO
    //     return null
    // }

    async info(): Promise<string> {
        let info = ""
        // TODO
        return info
    }

    // INFO Returning an empty raw transaction skeleton
    // async createRawTransaction(): Promise<Transaction> {

    // }

    // INFO Placeholder compatibility function that is here only for the interface
    override async signTransaction(tx: Transaction, options?: SignTxOptions) {
        required(this.wallet, "Wallet not connected")
        // LINK https://docs.shyft.to/tutorials/how-to-sign-transactions-on-solana
        // NOTE Due to the above, the transaction is signed and sent at the same time.
        // tx.addSignature()
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    async readNonce(address: string) {
        console.log("reading nonce account: ", address)
        const pubkey = new PublicKey(address)
        const accountInfo = await this.provider.getAccountInfo(pubkey)
        console.log("accountInfo: ", accountInfo)

        if (accountInfo) {
            return NonceAccount.fromAccountData(accountInfo?.data)
        }

        return null
    }

    async createNonceAccount() {
        required(this.wallet, "Wallet not connected")

        let tx = new Transaction()
        const nonceAccount = Keypair.generate()

        const create_acc_ix = SystemProgram.createAccount({
            fromPubkey: this.wallet.publicKey,
            newAccountPubkey: nonceAccount.publicKey,
            lamports: await this.provider.getMinimumBalanceForRentExemption(
                NONCE_ACCOUNT_LENGTH,
            ),
            space: NONCE_ACCOUNT_LENGTH,
            programId: SystemProgram.programId,
        })

        const init_nonce_ix = SystemProgram.nonceInitialize({
            noncePubkey: nonceAccount.publicKey,
            authorizedPubkey: this.wallet.publicKey,
        })

        tx.add(create_acc_ix, init_nonce_ix)

        const txhash = this.provider.sendTransaction(tx, [
            this.wallet,
            nonceAccount,
        ])
        console.log("txhash: ", txhash)

        return nonceAccount.publicKey.toBase58()
    }

    async signTransactions(
        transactions: Transaction[],
        options?: SignTxOptions,
    ) {
        required(this.wallet, "Wallet not connected")

        let nonceAccount: NonceAccount | null = null
        let advanceNonceIx: TransactionInstruction | null = null
        let nonceAuthority: Keypair = this.wallet

        const nonceAccAvailable =
            options && options.nonceAccountAddress ? true : false

        // if we have the nonce authority, overwrite.
        if (nonceAccAvailable && options.nonceAccountAuthority) {
            nonceAuthority = Keypair.fromSecretKey(
                bs58.decode(options.nonceAccountAuthority),
            )
        }

        // if we have the nonce address, create a nonce advance instruction
        if (nonceAccAvailable) {
            advanceNonceIx = SystemProgram.nonceAdvance({
                authorizedPubkey: nonceAuthority.publicKey,
                noncePubkey: new PublicKey(options.nonceAccountAddress),
            })

            nonceAccount = await this.readNonce(options.nonceAccountAddress)
        }

        // if advance instruction is not null
        // ie. we have the nonce address,
        // insert the advance nonce ix at instructions index 0
        // on each transaction
        if (advanceNonceIx && nonceAccount) {
            transactions.forEach(tx => {
                tx.instructions.splice(0, 0, advanceNonceIx!)

                // update recent block hash to use the current nonce
                tx.recentBlockhash = nonceAccount!.nonce
                nonceAccount?.nonce
                // TODO: FIND OUT WHAT HAPPENS WHEN MULTIPLE TX HAVE THE SAME DURABLE NONCE
            })
        }

        const signers = new Set([this.wallet, nonceAuthority])
        console.log("signers length: ", signers.size)
        console.log("signers: ", signers)

        transactions.forEach(async tx => {
            tx.sign(...signers)
        })

        return transactions
    }

    override getAddress() {
        required(this.wallet, "Wallet not connected")

        return this.wallet.publicKey.toBase58()
    }

    getEmptyTransaction() {
        // const recentBlockhash = await this.provider.getLatestBlockhash()
        const options = <TransactionNonceCtor>{
            feePayer: this.wallet.publicKey,
        }

        let empty_tx = new Transaction(options)
        // empty_tx.recentBlockhash = recentBlockhash.blockhash
        // empty_tx.lastValidBlockHeight = recentBlockhash.lastValidBlockHeight

        return empty_tx
    }

    override async preparePay(
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

    override async preparePays(
        payments: IPayOptions[],
        options?: SignTxOptions,
    ) {
        const recentBlockhash = await this.provider.getLatestBlockhash()

        const transactions = payments.map(payment => {
            const tx = this.getEmptyTransaction()
            tx.recentBlockhash = recentBlockhash.blockhash
            tx.lastValidBlockHeight = recentBlockhash.lastValidBlockHeight

            const transferIx = SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: new PublicKey(payment.address),
                lamports:
                    parseFloat(payment.amount as string) * LAMPORTS_PER_SOL,
            })

            tx.add(transferIx)
            return tx
        })

        return this.signTransactions(transactions, options)
    }

    override async prepareTransfer(
        receiver: string,
        amount: string,
        options: {},
    ) {
        return await this.preparePay(receiver, amount, options)
    }

    override async prepareTransfers(transfers: IPayOptions[], options: {}) {
        return await this.preparePays(transfers, options)
    }

    // TODO: move sendTransaction to localsdk
    // INFO Sending a transfer transaction on Solana network
    // sendTransaction({ to, amount }) {
    //     required(this.wallet, 'Wallet not connected')
    //     let tx = new Transaction()
    //     tx.add(
    //         SystemProgram.transfer({
    //             fromPubkey: this.wallet.publicKey,
    //             toPubkey: to,
    //             lamports: amount * LAMPORTS_PER_SOL,
    //         })
    //     )
    //     let result = sendAndConfirmTransaction(this.provider, tx, [
    //         this.wallet,
    //     ])
    //     return result
    // }

    // ANCHOR Static singleton methods

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
