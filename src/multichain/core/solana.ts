import {
    Address,
    AnchorProvider,
    Idl,
    Program,
    Wallet,
} from "@project-serum/anchor"
import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js"
import base58 from "bs58"

import { ns64, struct, u32 } from "@solana/buffer-layout"
import { DefaultChain, SolanaDefaultChain } from "./types/defaultChain"
import {
    IPayParams,
    SolanaReadAccountDataOptions,
    SolanaRunRawProgramParams,
    SolanarunProgramParams,
} from "./types/interfaces"
import { required } from "./utils"

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

export class SOLANA extends DefaultChain implements SolanaDefaultChain {
    private static instance: SOLANA

    declare wallet: Keypair
    declare provider: Connection

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "solana"
    }

    override setRpc(rpc_url: string): void {
        this.rpc_url = rpc_url
        this.provider = new Connection(this.rpc_url, {
            confirmTransactionInitialTimeout: 15000,
        })
    }

    async connect() {
        try {
            const version = await this.provider.getVersion()
            this.connected = Number.isInteger(version["feature-set"])
        } catch (error) {
            this.connected = false
        }

        return this.connected
    }

    // async disconnect() {
    //     this.resetInstance()
    //     return true
    // }

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

    override async signTransaction(
        tx: VersionedTransaction,
        options?: SignTxOptions,
    ) {
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

    async preparePays(payments: IPayParams[], options?: SignTxOptions) {
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

    // SECTION: Programs
    async getProgramIdl(programId: Address) {
        const provider = {
            connection: this.provider,
        }

        return await Program.fetchIdl(programId, provider)
    }

    async fetchAccount(
        address: Address,
        options: SolanaReadAccountDataOptions,
    ) {
        let programId = options.programId
        let idl = options.idl as Idl

        if (!programId) {
            // INFO: Fetch the program ID from the account
            const accInfo = await this.provider.getAccountInfo(
                new PublicKey(address),
            )

            programId = accInfo.owner
        }

        if (!idl) {
            // INFO: Fetch the IDL from the network
            idl = await this.getProgramIdl(options.programId)
        }

        const program = new Program(idl, programId, {
            connection: this.provider,
        })

        return await program.account[options.name].fetch(address)
    }

    async runAnchorProgram(programId: string, params: SolanarunProgramParams) {
        // REVIEW: Do we need to connect our wallet with the anchor provider?
        const wallet = new Wallet(this.wallet)
        const pid = new PublicKey(programId)
        const anchorProvider = new AnchorProvider(this.provider, wallet, {})

        let idl = params.idl as Idl

        if (!idl) {
            // INFO: If not using manual IDL, fetch it from the network
            idl = await this.getProgramIdl(programId)
        }

        if (!idl) {
            // INFO: If no IDL is found, throw an error
            throw new Error("No IDL found for this program")
        }

        // INFO: Get the IDL and create program interface
        const program = new Program(idl, pid, anchorProvider)

        // INFO: construct the transaction
        const ix = program.methods[params.instruction]
        // calling the method with undefined throws an error, so prevent it
        const _ix = params.args ? ix(params.args) : ix()
        const tx = await _ix
            .accounts(params.accounts)
            // .signers(params.signers)
            .transaction()

        // INFO: Add fee payer and validity data
        tx.feePayer = params.feePayer
        const block = await this.provider.getLatestBlockhash()
        tx.recentBlockhash = block.blockhash
        tx.lastValidBlockHeight = block.lastValidBlockHeight

        // INFO: Sign and return the tx
        tx.sign(...params.signers)
        return tx.serialize()
    }

    async runRawProgram(programId: Address, params: SolanaRunRawProgramParams) {
        // INFO: Set fee payer
        const tx = new Transaction({
            feePayer: params.feePayer,
        })

        // INFO: Locate the instruction
        const ix = {
            index: params.instructionIndex,
            // @ts-expect-error
            layout: struct([u32("instruction"), ns64(params.instructionName)]),
        }

        // INFO: Encode the instruction and its parameters
        // Create an empty buffer
        let data = Buffer.alloc(ix.layout.span)
        let layoutFields = Object.assign(
            {
                instruction: ix.index,
            },
            params.params,
        )
        // Write the data to the buffer
        ix.layout.encode(layoutFields, data)

        // INFO: Add the instruction to the transaction
        tx.add(
            new TransactionInstruction({
                keys: params.keys,
                programId: new PublicKey(programId),
                data: data,
            }),
        )

        // INFO: Add validity information
        const block = await this.provider.getLatestBlockhash()
        tx.recentBlockhash = block.blockhash
        tx.lastValidBlockHeight = block.lastValidBlockHeight

        // INFO: Sign and return the transaction
        tx.sign(...params.signers)
        return tx.serialize()
    }

    // SECTION: Singleton methods

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
