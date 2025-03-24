/* eslint-disable no-unused-vars */
// @ts-ignore
import forge from "node-forge"
import { required } from "./utils/required"
import * as forge_converter from "./utils/forge_converter"
import { RSA } from "./rsa"
import { IKeyPair, IStringifiedKeyPair } from "./types/KeyPair"
import { Cryptography } from "@/encryption/Cryptography"

// TODO Could this be an universal "Sign in with DEMOS" ? Maybe

// INFO Enabling DEMOS wallet connections in the browser exposing a singleton
// NOTE All the methods below return an array of [boolean, string | any] where any can be the result of the method
export class DemosWebAuth {
    static _instance = <DemosWebAuth | null>null
    loggedIn = false
    keypair = <IKeyPair | null>null
    stringified_keypair = <IStringifiedKeyPair | null>null

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
        if (!seed) {
            seed = forge.random.getBytesSync(32)
        }
        let result: [boolean, IStringifiedKeyPair] = [true, {} as any]

        try {
            this.keypair = {
                privateKey: null,
                publicKey: null,
            }
            this.keypair = forge.pki.ed25519.generateKeyPair({ seed })
            this.loggedIn = true
            // Stringify the keypair
            this.stringified_keypair = {
                privateKey: forge_converter.forgeToString(
                    this.keypair.privateKey,
                ),
                publicKey: forge_converter.forgeToString(
                    this.keypair.publicKey,
                ),
            }
            result = [true, this.stringified_keypair]
        } catch (e) {
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
            console.log("privKey", privKey)
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
                privateKey: forge_converter.forgeToString(
                    this.keypair.privateKey,
                ),
                publicKey: forge_converter.forgeToString(
                    this.keypair.publicKey,
                ),
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
                privateKey: forge_converter.stringToForge(
                    this.stringified_keypair?.privateKey,
                ),
                publicKey: forge_converter.stringToForge(
                    this.stringified_keypair?.publicKey,
                ),
            }
        }
        let result = [true, {}]
        try {
            const sign_result = forge.pki.ed25519.sign({
                message: message,
                privateKey: this.keypair!.privateKey as Uint8Array,
            })

            result = [true, sign_result]
        } catch (e: any) {
            result = [false, "[SIGN ERROR] " + e.message]
        }
        return result // Is already a [boolean, string]
    }

    async verify(message: any, s_signature: any, s_publicKey: any) {
        let result = [true, ""]
        // Deriving the buffers from the strings
        const publicKey = forge_converter.stringToForge(s_publicKey)
        const signature = forge_converter.stringToForge(s_signature)

        if (!signature) {
            return [false, "Invalid signature"]
        }

        if (!publicKey) {
            return [false, "Invalid public key"]
        }

        try {
            const verify_result = forge.pki.ed25519.verify({
                message: message,
                signature: signature,
                publicKey: publicKey,
            })

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
