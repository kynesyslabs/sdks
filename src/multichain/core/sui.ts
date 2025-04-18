import { SuiClient } from "@mysten/sui/client"
import { DefaultChain } from "./types/defaultChain"
import { required } from "./utils"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { fromB64 } from "@mysten/bcs"
import * as ed from "@noble/ed25519"

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
        const keypair = new Ed25519Keypair()
        const address = keypair.getPublicKey().toSuiAddress()
        const secretKey = keypair.getSecretKey()

        return {
            address,
            secretKey,
            keypair,
        }
    }

    async connectWallet(privateKey: string) {
        const keypair = Ed25519Keypair.fromSecretKey(
            Buffer.from(privateKey, "base64"),
        )

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
            const keypair = Ed25519Keypair.fromSecretKey(
                Buffer.from(options.privateKey, "base64"),
            )
            signer = keypair
        }

        const bytes = new TextEncoder().encode(message)
        const signed = await signer.signPersonalMessage(bytes)
        return signed.signature
    }

    override async verifyMessage(
        message: string,
        signature: string,
        publicKey: string,
    ): Promise<boolean> {
        const msgBytes = new TextEncoder().encode(message)
        const sigBytes = fromB64(signature)
        const pubKeyBytes = fromB64(publicKey)
        const isValid = await ed.verify(sigBytes, msgBytes, pubKeyBytes)

        return isValid
    }

    override getEmptyTransaction() {
        return
    }

    async preparePay(receiver: string, amount: string, options?: any) {
        return
    }

    async preparePays(
        payments: { address: string; amount: string }[],
        options?: any,
    ) {
        return []
    }

    override async signTransaction(tx: any, options?: any) {
        return
    }

    override async signTransactions(
        transactions: any[],
        options?: any,
    ): Promise<any[]> {
        return []
    }

    async executeTransaction(tx: any, options?: any) {
        return
    }
}
