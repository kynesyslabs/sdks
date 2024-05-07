// TODO & REVIEW See if the fs methods are useful in this context or nah (also the public ip)

import * as forge from "node-forge"
import * as fs from "fs"
import { Cryptography } from "@/encryption"
import getRemoteIP from "@/utils/getRemoteIP"

export default class Wallet {
    private static instance: Wallet
    public ed25519: forge.pki.KeyPair
    public ed25519_hex: {
        privateKey: string
        publicKey: string
    }
    public rsa: forge.pki.rsa.KeyPair
    public rsa_hex: {
        privateKey: string
        publicKey: string
    }
    public publicIP: string
    public publicPort: string

    // Make the constructor private.
    private constructor() {
        this.ed25519 = null
        this.publicIP = null
        this.publicPort = null
    }

    // Create a public static method to get the instance of the Wallet class
    public static getInstance(): Wallet {
        if (!Wallet.instance) {
            Wallet.instance = new Wallet()
        }
        return Wallet.instance
    }

    async ensureIdentity(): Promise<void> {
        if (fs.existsSync("./.demos_identity")) {
            // Loading the identity
            // TODO Add load with  Cryptography
            this.ed25519 = await  Cryptography.load("./.demos_identity")
            console.log("Loaded ecdsa identity")
        } else {
            this.ed25519 =  Cryptography.new()
            // Writing the identity to disk in binary format
            await  Cryptography.save(this.ed25519, "./.demos_identity")
            console.log("Generated new identity")
        }
        // Stringifying to hex
        this.ed25519_hex = {
            privateKey: "0x" + this.ed25519.privateKey.toString("hex"),
            publicKey: "0x" + this.ed25519.publicKey.toString("hex"),
        }
    }

    async getPublicIP(): Promise<string> {
        this.publicIP = await getRemoteIP()
        return await this.publicIP
    }

    getPublicKeyHex(): string | undefined {
        return "0x" + this.ed25519?.publicKey?.toString("hex")
    }

    setPublicPort(port: string): void {
        this.publicPort = port
    }

    getConnectionString(): string {
        return `http://${this.publicIP}>${
            this.publicPort
        }>${this.getPublicKeyHex()}`
    }
}
