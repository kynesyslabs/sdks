/* eslint-disable no-unused-vars */
// @ts-ignore
import forge from "node-forge"
import { required } from "./utils/required"
import { RSA } from "./rsa"
import { IKeyPair, IStringifiedKeyPair } from "./types/KeyPair"
import { Cryptography } from "@/encryption/Cryptography"

// TODO Could this be an universal "Sign in with DEMOS" ? Maybe

// INFO Enabling DEMOS wallet connections in the browser exposing a singleton
// NOTE All the methods below return an array of [boolean, string | any] where any can be the result of the method
export class DemosWebAuth {
    static _instance = <DemosWebAuth | null>null
    loggedIn = false
    keypair = <IKeyPair>null
    stringified_keypair = <IStringifiedKeyPair>null

    constructor() {
        this.loggedIn = false
        this.keypair = null
        this.stringified_keypair = null
    }

    /**
     * Description placeholder
     * @date 14/9/2023 - 13:52:34
     *
     * @static
     * @returns {DemosWebAuth}
     */
    static getInstance() {
        if (!this._instance) {
            this._instance = new DemosWebAuth()
        }
        return this._instance
    }

    async create(seed = "") {
        let result: [boolean, IKeyPair] = [true, {} as any]

        try {
            this.keypair = {
                privateKey: null,
                publicKey: null,
            }

            if (!seed) {
                this.keypair = Cryptography.new()
            } else {
                this.keypair = Cryptography.newFromSeed(seed)
            }

            this.loggedIn = true
            // Stringify the keypair
            this.stringified_keypair = {
                privateKey: new TextDecoder().decode(this.keypair.privateKey),
                publicKey: new TextDecoder().decode(this.keypair.publicKey),
            }
            result = [true, this.keypair]
        } catch (e) {
            console.error(e)
            // @ts-expect-error
            result = [false, "[CREATE WALLET ERROR] " + e.message]
        }

        return result
    }

    /**
     * Creates a new keypair from a seed
     * @param mnemonic White-space separated string of words or a bip39 seed buffer
     * @returns A new keypair
     */
    static keyPairFromMnemonic(mnemonic: string | Buffer | Uint8Array) {
        return Cryptography.newFromSeed(mnemonic)
    }

    // NOTE We just have to accept valid private keys and derive the public key from them
    async login(
        privKey: string | boolean | Uint8Array,
    ): Promise<[boolean, string]> {
        if (typeof privKey === "string") {
            // REVIEW: Should we do this?
            if (privKey.startsWith("0x")) {
                // Remove the 0x prefix
                privKey = privKey.slice(2)
            }

            privKey = forge.util.binary.hex.decode(privKey)
            if (!privKey) {
                return [false, "Cannot convert private key from that string!"]
            }
        }
        if (!required(privKey, false)) {
            return [false, "You need to provide a private key!"]
        }
        // Serializing the private key as a string

        // console.log("[LOGIN WALLET] Serializing private key...")
        // this.keypair.privateKey = forge_converter.stringToForge(this.stringified_keypair.privateKey)
        // console.log(this.keypair.privateKey)

        this.keypair = {
            privateKey: privKey as Uint8Array,
            publicKey: forge.pki.ed25519.publicKeyFromPrivateKey({
                privateKey: privKey as Uint8Array,
            }),
        }

        // Logging in avoiding crashes on wrong private keys
        try {
            this.keypair.publicKey = forge.pki.ed25519.publicKeyFromPrivateKey({
                privateKey: privKey as Uint8Array,
            })
            this.stringified_keypair = {
                privateKey: new TextDecoder().decode(this.keypair.privateKey),
                publicKey: new TextDecoder().decode(this.keypair.publicKey),
            }
            this.loggedIn = true

            return [true, "Successfully logged in!"]
        } catch (e) {
            console.error(e)
            return [false, "[LOGIN ERROR] Cannot derive publicKey!"]
        }
    }

    /**
     * @description Disconnects a wallet from the Demos chain
     * @returns {Promise<[boolean, string]>}
     **/
    async logout() {
        if (!required(this.keypair, false)) {
            return [true, "You are already logged out!"]
        }
        this.loggedIn = false
        this.keypair = null
        this.stringified_keypair = null
        return [true, "Successfully logged out!"]
    }

    async sign(message: any) {
        if (!required(this.keypair || this.stringified_keypair, false)) {
            return [false, "You need to login first!"]
        }
        // If needed, we derive the keys from the strings
        if (!this.keypair) {
            this.keypair = {
                privateKey: new TextEncoder().encode(
                    this.stringified_keypair?.privateKey,
                ),
                publicKey: new TextEncoder().encode(
                    this.stringified_keypair?.publicKey,
                ),
            }
        }

        let result = [true, {}]
        try {
            const sign_result = Cryptography.sign(
                message,
                this.keypair.privateKey,
            )

            result = [true, sign_result]
        } catch (e: any) {
            result = [false, "[SIGN ERROR] " + e.message]
        }
        return result // Is already a [boolean, string]
    }

    async verify(
        message: string | Uint8Array,
        signature: string | Uint8Array,
        publicKey: string | Uint8Array,
    ) {
        let result = [true, ""]
        // If the message is a Uint8Array, we convert it to a string
        if (typeof message === "object" && message instanceof Uint8Array) {
            message = new TextDecoder().decode(message)
        }
        // If the signature is a string, we convert it to a Uint8Array
        if (typeof signature === "string") {
            signature = new TextEncoder().encode(signature)
        }
        // If the public key is a string, we convert it to a Uint8Array
        if (typeof publicKey === "string") {
            publicKey = new TextEncoder().encode(publicKey)
        }

        if (!signature) {
            return [false, "Invalid signature"]
        }

        if (!publicKey) {
            return [false, "Invalid public key"]
        }

        try {
            const verify_result = Cryptography.verify(
                message,
                signature,
                publicKey,
            )

            result = [true, verify_result]
        } catch (e: any) {
            result = [false, "[VERIFY ERROR] " + e.message]
        }
        return result // Is already a [boolean, string]
    }

    rsa() {
        return RSA.getInstance()
    }
}

// export default DemosWebAuth;
