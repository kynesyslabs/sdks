// TODO & REVIEW See if the fs methods are useful in this context or nah (also the public ip)

import * as forge from "node-forge"

import * as websdk from "@/websdk"
import { DemosTransactions } from "@/websdk"
import { PasskeyGenerator } from "./passkeys/passkeys"
import { Cryptography } from "@/encryption/Cryptography"
import { Address } from "@/types/blockchain/WalletTypes"
import { RPCResponseWithValidityData } from "@/types/communication/rpc"

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

    /**
     * Transfer native DEM tokens to a recipient address.
     *
     * P4 dual-input:
     *  - `bigint` (preferred, post-v3): OS amount. 1 DEM = 10^9 OS.
     *  - `number` (deprecated, v2 callers): DEM amount, auto-converted.
     *
     * Internal carrier is OS bigint; the serializerGate (run from
     * `demos.sign`) chooses pre-fork vs post-fork wire encoding from
     * the cached `getNetworkInfo` fork status. Sub-DEM precision
     * against a pre-fork node throws `SubDemPrecisionError` from
     * `demos.pay` before any tx construction happens — we delegate to
     * `demos.pay` which carries the guard.
     *
     * @example
     * ```ts
     * import { denomination, websdk, wallet } from "@kynesyslabs/demosdk"
     * const w = wallet.default.getInstance("alice")
     * await w.transfer("0x...", denomination.demToOs(100), demos)
     * await w.transfer("0x...", 100_000_000_000n, demos)  // raw OS
     * ```
     *
     * @param to - Recipient address (0x-prefixed hex).
     * @param amount - DEM `number` (legacy) or OS `bigint`.
     * @param demos - Demos client used to sign and submit.
     */
    async transfer(
        to: Address,
        amount: number | bigint,
        demos: websdk.Demos,
    ): Promise<RPCResponseWithValidityData> {
        // Delegate to demos.pay so we get the sub-DEM guard, the
        // serializerGate, and the canonical native-send tx shape (with
        // nonce, timestamp, gcr_edits, fee derivation) for free.
        const tx = await demos.pay(to, amount)
        return await demos.confirm(tx)
    }

    // TODO Implement other methods too

    // NOTE  This is a quick wrapper to avoid having to write the same code over and over again
    async broadcast(
        validityData: RPCResponseWithValidityData,
        demos: websdk.Demos,
    ): Promise<any> {
        return await demos.broadcast(validityData)
    }

    // REVIEW Passkeys support
    async generatePasskey(): Promise<string> {
        const passkeyGenerator = new PasskeyGenerator()
        return await passkeyGenerator.generate()
    }
}
