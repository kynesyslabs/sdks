import { SuiClient } from "@mysten/sui/client"
import { DefaultChain } from "./types/defaultChain"
import { required } from "./utils"
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
import { Transaction } from "@mysten/sui/transactions"

export class SUI extends DefaultChain {
    declare provider: SuiClient
    declare wallet: Ed25519Keypair

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "sui"
    }

    override setRpc(rpc_url: string): void {
        this.rpc_url = rpc_url

        this.provider = new SuiClient({
            url: this.rpc_url,
        })
    }

    async connect() {
        try {
            const version = await this.provider.getRpcApiVersion()
            this.connected = !!version
        } catch (error) {
            this.connected = false
        }

        return this.connected
    }

    async createWallet() {
        const mnemonic = bip39.generateMnemonic(wordlist)
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic)
        const publicKey = keypair.getPublicKey()
        const address = publicKey.toSuiAddress()

        return {
            address,
            publicKey,
            keypair,
        }
    }

    async connectWallet(privateKey: string) {
        if (!privateKey || typeof privateKey !== "string") {
            throw new TypeError(
                "Invalid privateKey: must be a non-empty base64 string",
            )
        }

        const keypair = Ed25519Keypair.deriveKeypair(privateKey)
        this.wallet = keypair
        return this.wallet
    }

    getAddress() {
        return this.wallet.toSuiAddress()
    }

    async getBalance(address: string) {
        const balance = await this.provider.getBalance({ owner: address })
        return balance.totalBalance.toString()
    }

    override async signMessage(
        message: string,
        options?: { privateKey?: string },
    ): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")

        let signer = this.wallet
        if (options?.privateKey) {
            const keypair = Ed25519Keypair.deriveKeypair(options.privateKey)
            signer = keypair
        }

        const messageBytes = new TextEncoder().encode(message)
        const signed = await signer.signPersonalMessage(messageBytes)

        return signed.signature
    }

    override async verifyMessage(
        message: string,
        signature: string,
        publicKey: string,
    ): Promise<boolean> {
        const messageBytes = new TextEncoder().encode(message)
        const ed25519PublicKey = new Ed25519PublicKey(publicKey)
        const isValid = await ed25519PublicKey.verifyPersonalMessage(
            messageBytes,
            signature,
        )

        return isValid
    }

    override getEmptyTransaction() {
        return new Transaction()
    }

    async preparePay(
        address: string,
        amount: string,
    ): Promise<{ bytes: string; signature: string }> {
        const results = await this.preparePays([{ address, amount }])
        return results[0]
    }

    async preparePays(
        payments: { address: string; amount: string }[],
        options?: { privateKey?: string },
    ): Promise<{ bytes: string; signature: string }[]> {
        const results: { bytes: string; signature: string }[] = []

        let keypair: Ed25519Keypair = this.wallet
        if (options?.privateKey) {
            const pkStr = options.privateKey
            let secretKeyBytes: Uint8Array
            if (pkStr.startsWith("0x")) {
                secretKeyBytes = Uint8Array.from(
                    Buffer.from(pkStr.slice(2), "hex"),
                )
            } else {
                secretKeyBytes = Uint8Array.from(Buffer.from(pkStr, "base64"))
            }
            keypair = Ed25519Keypair.fromSecretKey(secretKeyBytes)
        }

        const sender = keypair.getPublicKey().toSuiAddress()
        for (const { address, amount } of payments) {
            const tx = new Transaction()
            tx.setSender(sender)
            tx.setGasPrice(1)
            tx.setGasBudget(1_000_000)

            const coinToSend = tx.splitCoins(tx.gas, [BigInt(amount)])
            tx.transferObjects([coinToSend], address)

            const bytes: Uint8Array = await tx.build({ client: this.provider })
            const signatureData = await keypair.signTransaction(bytes)
            const txBytesBase64 = Buffer.from(bytes).toString("base64")
            const signatureBase64 = Buffer.from(
                signatureData.signature,
            ).toString("base64")

            results.push({
                bytes: txBytesBase64,
                signature: signatureBase64,
            })
        }

        return results
    }

    override async signTransaction(
        tx: Transaction,
        options?: { privateKey?: string },
    ): Promise<{ bytes: string; signature: string }> {
        const txs = await this.signTransactions([tx], options)
        return txs[0]
    }

    override async signTransactions(
        transactions: Transaction[],
        options?: { privateKey?: string },
    ): Promise<{ bytes: string; signature: string }[]> {
        if (!this.wallet) {
            throw new Error("Wallet not connected")
        }

        let signingKey: Ed25519Keypair
        if (options?.privateKey) {
            const secretKeyBytes = Buffer.from(options.privateKey, "base64")
            signingKey = Ed25519Keypair.fromSecretKey(secretKeyBytes)
        } else {
            signingKey = this.wallet
        }

        const signedTransactions: { bytes: string; signature: string }[] = []
        for (const tx of transactions) {
            try {
                const txBytes = await tx.build({ client: this.provider })
                const { signature } = await signingKey.signTransaction(txBytes)
                const txBytesBase64 = Buffer.from(txBytes).toString("base64")
                signedTransactions.push({
                    bytes: txBytesBase64,
                    signature: signature,
                })
            } catch (error: any) {
                throw new Error(`Failed to sign transaction: ${error.message}`)
            }
        }

        return signedTransactions
    }
}
