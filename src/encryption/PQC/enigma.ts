/* INFO Enigma - An experimental wrapper for Post Quantum Cryptography in Typescript designed with ease of use in mind
  Currently suggested and tested schemas for each algorithm are:
  - Signing: ml-dsa or falcon
  - Encryption: NTRU
  - Hashing: SHA-3

  While implemented, the following algorithms are not included in the pqc test suite:
  - Key Encapsulation: McEliece

  While implemented, the following algorithms are not fully tested:
  - ChaCha20-Poly1305
  To properly test the encryption and decryption of data, please see the pqc test suite.
*/
import { ml_kem768 } from "@noble/post-quantum/ml-kem"
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa"
import { sha3_256 } from "@noble/hashes/sha3"
import * as crypto from "crypto"
import { Falcon } from "./falconts"
import { randomBytes } from "crypto"

export class Enigma {

    // ml-dsa signing keypair
    ml_dsa_signing_keypair: {
        publicKey: Uint8Array
        privateKey: Uint8Array
    } = null

    // falcon signing keypair
    falcon_signing_keypair: {
        genKey: Uint8Array
        publicKey: Uint8Array
        privateKey: Uint8Array
    } = null

    // ml-kem encryption keypair
    ml_kem_encryption_keypair: {
        publicKey: Uint8Array
        privateKey: Uint8Array
    } = null

    // ml-kem-aes parameters
    ml_kem_aes_parameters: string = null

    constructor() {}

    // Static methods

    /**
     * Hashes data using SHA-3-256
     * @param data The data to hash
     * @returns The hash of the data
     */
    static async hash(data: string, algorithm: string = "sha3-256"): Promise<Uint8Array> {
        // NOTE: algorithm is not used yet, but will be used in the future
        return sha3_256.create().update(data).digest()
    }

    /**
     * Verifies a signature using ml-dsa
     * @param signature The signature to verify
     * @param message The message to verify the signature against
     * @param publicKey The public key to verify the signature against
     * @returns True if the signature is valid, false otherwise
     */
    static async verify_ml_dsa(
        signature: Uint8Array,
        message: Uint8Array,
        publicKey: Uint8Array,
    ): Promise<boolean> {
        return ml_dsa65.verify(publicKey, message, signature)
    }

    /**
     * Verifies a signature using falcon
     * @param signature The signature to verify
     * @param message The message to verify the signature against
     * @param publicKey The public key to verify the signature against
     * @returns True if the signature is valid, false otherwise
     */
    static async verify_falcon(
        signature: Uint8Array,
        message: string,
        publicKey: Uint8Array,
    ): Promise<boolean> {
        const falcon = new Falcon() // Initialize falcon kernel
        await falcon.init()
        return falcon.verify(message, signature, publicKey)
    }

    // Dynamic methods

    /** Sign data using ml_dsa
     * @param message The message to sign
     * @returns The signature of the message
     */
    async sign_ml_dsa(message: Uint8Array): Promise<Uint8Array> {
        if (!this.ml_dsa_signing_keypair.privateKey) {
            throw new Error("ml_dsa_signing_keypair.privateKey is not set")
        }
        return ml_dsa65.sign(this.ml_dsa_signing_keypair.privateKey, message)
    }

    /** Sign data using falcon
     * @param message The message to sign
     * @returns The signature of the message
     */
    async sign_falcon(message: string): Promise<Uint8Array> {
        if (!this.falcon_signing_keypair.privateKey) {
            throw new Error("falcon_signing_keypair.privateKey is not set")
        }
        const falcon = new Falcon()
        await falcon.init()
        await falcon.setKeypair({
            genkeySeed: this.falcon_signing_keypair.genKey,
            sk: this.falcon_signing_keypair.privateKey,
            pk: this.falcon_signing_keypair.publicKey,
        })
        return falcon.sign(message, this.falcon_signing_keypair.privateKey)
    }

    /** Encrypt data using ml_kem + aes
     * @param message The message to encrypt
     * @returns The encrypted message
     */
    async encrypt_ml_kem_aes(
        message: Uint8Array,
        peerPublicKey: Uint8Array,
    ): Promise<{
        cipherText: Uint8Array
        encryptedMessage: Uint8Array
    }> {
        if (!this.ml_kem_encryption_keypair.privateKey) {
            throw new Error("ml_kem_encryption_keypair.privateKey is not set")
        }
        // Generate shared secret and encapsulate it in a cipher text using ml_kem and the peer's public key
        const encapsulatedSecret = ml_kem768.encapsulate(peerPublicKey)

        // Encrypt the message using AES-256-GCM with the shared secret
        const iv = crypto.randomBytes(12) // 96-bit IV for GCM mode
        const cipher = crypto.createCipheriv(
            "aes-256-gcm",
            encapsulatedSecret.sharedSecret,
            iv,
        )

        // Encrypt the message
        const encryptedMessage = Buffer.concat([
            cipher.update(message),
            cipher.final(),
        ])

        // Get the authentication tag
        const authTag = cipher.getAuthTag()

        // Combine IV, encrypted message, and auth tag for transmission
        const combinedEncryptedData = Buffer.concat([
            iv,
            encryptedMessage,
            authTag,
        ])

        return {
            cipherText: encapsulatedSecret.cipherText,
            encryptedMessage: combinedEncryptedData,
        }
    }

    /** Decrypt data using ml_kem + aes
     * @param encryptedMessage The encrypted message to decrypt
     * @param cipherText The cipher text containing the encapsulated shared secret
     * @returns The decrypted message
     */
    async decrypt_ml_kem_aes(
        encryptedMessage: Uint8Array,
        cipherText: Uint8Array,
    ): Promise<Uint8Array> {
        if (!this.ml_kem_encryption_keypair.privateKey) {
            throw new Error("ml_kem_encryption_keypair.privateKey is not set")
        }
        // Get the shared secret from the cipher text
        const sharedSecret = ml_kem768.decapsulate(cipherText, this.ml_kem_encryption_keypair.privateKey)

        // Decrypt the message using AES-256-GCM with the shared secret
        const iv = encryptedMessage.slice(0, 12)
        const message = encryptedMessage.slice(12, -16)
        const authTag = encryptedMessage.slice(-16)

        // Decrypt the message
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            sharedSecret,
            iv,
        )
        decipher.setAuthTag(authTag)
        const decryptedMessage = Buffer.concat([
            decipher.update(message),
            decipher.final(),
        ])
        return decryptedMessage
    }

    // Keypair generation methods

    /**
     * Generates a ml_dsa signing keypair given a seed or creating one
     * @param seed (optional) the seed used to generate the keypair
     */
    async generate_ml_dsa_signing_keypair(
        seed: Uint8Array = null,
    ): Promise<void> {
        if (!seed) {
            seed = randomBytes(32)
        }
        const keypair = ml_dsa65.keygen(seed)
        this.ml_dsa_signing_keypair = {
            publicKey: keypair.publicKey,
            privateKey: keypair.secretKey,
        }
    }

    /**
     * Generates a falcon signing keypair given a seed or creating one
     * @param seed (optional) the seed used to generate the keypair
     */
    async generate_falcon_signing_keypair(
        seed: Uint8Array = null,
    ): Promise<void> {
        if (!seed) {
            seed = randomBytes(48)
        }
        const falcon = new Falcon()
        await falcon.init()
        await falcon.genkey(seed)
        const falconKeyPair = await falcon.getKeypair()
        this.falcon_signing_keypair.genKey = falconKeyPair.genkeySeed
        this.falcon_signing_keypair.publicKey = falconKeyPair.pk
        this.falcon_signing_keypair.privateKey = falconKeyPair.sk
    }

    /**
     * Generates a ml_kem encryption keypair given a seed or creating one
     * @param seed (optional) the seed used to generate the keypair
     */
    async generate_ml_kem_encryption_keypair(
        seed: Uint8Array = null,
    ): Promise<void> {
        if (!seed) {
            seed = randomBytes(64)
        }
        let keys = ml_kem768.keygen(seed)
        this.ml_kem_encryption_keypair = {
            privateKey: keys.secretKey,
            publicKey: keys.publicKey,
        }
    }
}
