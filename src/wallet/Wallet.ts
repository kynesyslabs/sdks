// TODO & REVIEW See if the fs methods are useful in this context or nah (also the public ip)

import { Cryptography } from "@/encryption/Cryptography"
import { Address } from "@/types/blockchain/WalletTypes"
import { RPCResponseWithValidityData } from "@/types/communication/rpc"
import * as websdk from "@/websdk"
import { DemosTransactions } from "@/websdk"
import { IKeyPair } from "@/websdk/types/KeyPair"
import { PasskeyGenerator } from "./passkeys/passkeys"
import * as forge from "node-forge"

export default class Wallet {
    // A wallet class is a singleton class, so we need to make sure that only one instance per id is created.
    private static instances: { [key: string]: Wallet } = {}
    // A DEMOS wallet is comprised of both an ed25519 keypair and an rsa keypair.
    public ed25519: forge.pki.KeyPair
    public ed25519_hex: {
        privateKey: string
        publicKey: string
    }
    // TODO Implement RSA derivation from ED25519 private key
    public rsa: forge.pki.rsa.KeyPair
    public rsa_hex: {
        privateKey: string
        publicKey: string
    }

    private constructor() {
        this.ed25519 = null
        this.rsa = null
    }

    // Create a public static method to get the instance of the Wallet class
    public static getInstance(name: string): Wallet {
        if (!Wallet.instances[name]) {
            Wallet.instances[name] = new Wallet()
        }
        return Wallet.instances[name]
    }

    /* SECTION Create wallets */
    async create(): Promise<void> {
        this.ed25519 = Cryptography.new()
        this.ed25519_hex = {
            privateKey: "0x" + this.ed25519.privateKey.toString("hex"),
            publicKey: "0x" + this.ed25519.publicKey.toString("hex"),
        }
    }

    /* SECTION Load and save wallets */

    async loadFromKey(privateKey: Address): Promise<void> {
        this.ed25519 = await Cryptography.load(privateKey, false)
        this.ed25519_hex = {
            privateKey: "0x" + this.ed25519.privateKey.toString("hex"),
            publicKey: "0x" + this.ed25519.publicKey.toString("hex"),
        }
    }

    async load(filename: string): Promise<void> {
        this.ed25519 = await Cryptography.load(filename, true)
        this.ed25519_hex = {
            privateKey: "0x" + this.ed25519.privateKey.toString("hex"),
            publicKey: "0x" + this.ed25519.publicKey.toString("hex"),
        }
    }

    async save(filename: string): Promise<void> {
        await Cryptography.save(this.ed25519, filename)
    }

    /* SECTION nodeCalls */

    async getBalance(): Promise<void> {
        let info = await websdk.demos.getAddressInfo(this.ed25519_hex.publicKey)
        // TODO Implement this and other nodeCalls
        // return info.native.balance
    }

    /* SECTION Basic writes */
    // NOTE All the writes return a validity object that needs to be confirmed and broadcasted

    async transfer(to: Address, amount: number, keypair: IKeyPair) {
        let tx = DemosTransactions.empty()
        // Putting the right data in the transaction
        tx.content.from = keypair.publicKey.toString("hex")
        // tx.content.to = to
        tx.content.type = "native"
        tx.content.data = [
            "native",
            {
                nativeOperation: "send",
                args: [to, amount],
            },
        ]
        // tx.content.amount = amount
        tx = await DemosTransactions.sign(tx, keypair)
        // Sending the transaction and getting the validity data
        return await DemosTransactions.confirm(tx)
    }

    // TODO Implement other methods too

    // NOTE  This is a quick wrapper to avoid having to write the same code over and over again
    async broadcast(
        validityData: RPCResponseWithValidityData,
        keypair: IKeyPair,
    ): Promise<any> {
        return await websdk.demos.broadcast(validityData, keypair)
    }

    // REVIEW Passkeys support
    async generatePasskey(): Promise<string> {
        const passkeyGenerator = new PasskeyGenerator()
        return await passkeyGenerator.generate()
    }
}
