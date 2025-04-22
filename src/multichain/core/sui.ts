import { SuiClient } from "@mysten/sui/client"
import { DefaultChain } from "./types/defaultChain"
import { required } from "./utils"
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"

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
        const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
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
            throw new TypeError("Invalid privateKey: must be a non-empty base64 string")
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
        const ed25519PublicKey = new Ed25519PublicKey(publicKey);
        const isValid = await ed25519PublicKey.verifyPersonalMessage(messageBytes, signature);
        
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
