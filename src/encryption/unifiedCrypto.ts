import { sha256 } from '@noble/hashes/sha2';
import { Enigma } from "./PQC/enigma"
import { hkdf } from "@noble/hashes/hkdf"
import { randomBytes } from "@noble/hashes/utils"
import * as forge from "node-forge"
import { Cryptography } from "./Cryptography"
import { PQCAlgorithm, SigningAlgorithm } from '@/types/cryptography';

/* The two interfaces below are used to route the encrypted and signed data through the unified crypto system */
export interface encryptedObject {
    algorithm: "ml-kem-aes" | "rsa"
    encryptedData: Uint8Array
    cipherText?: Uint8Array
}

export interface SerializedEncryptedObject {
    algorithm: "ml-kem-aes" | "rsa"
    serializedEncryptedData: string
    serializedCipherText?: string
}

export interface SerializedSignedObject {
    algorithm: "ml-dsa" | "falcon" | "ed25519"
    serializedSignedData: string
    serializedPublicKey: string
    serializedMessage: string
}

export interface Ed25519SignedObject {
    algorithm: "ed25519"
    signature: Uint8Array
    publicKey: forge.pki.ed25519.NativeBuffer
    message: Uint8Array
}

export interface PqcSignedObject {
    algorithm: "ml-dsa" | "falcon"
    signature: Uint8Array
    publicKey: Uint8Array
    message: Uint8Array
}

export type signedObject = Ed25519SignedObject | PqcSignedObject

// SECTION Utilities

/**
 * Converts a Uint8Array to a hexadecimal string representation, prefixed with '0x'.
 *
 * @param bytes - The Uint8Array to convert.
 * @returns The hexadecimal string representation (e.g., "0x0a1b2c").
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
    // Convert each byte to a 2-digit hex string and pad with '0' if needed.
    const hexBytes = Array.from(bytes, byte => {
        return byte.toString(16).padStart(2, "0")
    })
    // Join the hex strings and prefix with '0x'.
    return "0x" + hexBytes.join("")
}

/**
 * Converts a hexadecimal string (with or without '0x' prefix) to a Uint8Array.
 *
 * @param hexString - The hexadecimal string to convert (e.g., "0x0a1b2c" or "0a1b2c").
 * @returns The corresponding Uint8Array.
 * @throws {Error} If the input string (after removing '0x') has an odd length
 * or contains non-hexadecimal characters.
 */
export function hexToUint8Array(hexString: string): Uint8Array {
    // Remove the '0x' prefix if it exists.
    const normalizedHexString = hexString.startsWith("0x")
        ? hexString.slice(2)
        : hexString

    // Handle empty string case after normalization
    if (normalizedHexString.length === 0) {
        return new Uint8Array(0) // Return an empty Uint8Array for an empty hex string
    }

    // Check if the string has an even number of characters.
    if (normalizedHexString.length % 2 !== 0) {
        throw new Error(
            "Invalid hex string: Hex string must have an even number of characters.",
        )
    }

    // Check if the string contains only valid hexadecimal characters.
    if (!/^[0-9a-fA-F]+$/.test(normalizedHexString)) {
        throw new Error(
            "Invalid hex string: Contains non-hexadecimal characters.",
        )
    }

    // Create an array to store the byte values.
    const bytes = new Uint8Array(normalizedHexString.length / 2)

    // Iterate over the string, taking two characters at a time.
    for (let i = 0; i < normalizedHexString.length; i += 2) {
        const byteString = normalizedHexString.substring(i, i + 2)
        const byteValue = parseInt(byteString, 16) // Parse the hex pair into a number.
        bytes[i / 2] = byteValue
    }

    return bytes
}

// SECTION UnifiedCrypto

/**
 * UnifiedCrypto is a class that provides a unified interface for the different encryption algorithms
 * It is used to encrypt and decrypt messages, sign and verify messages, and generate identities for the different algorithms
 * It uses Enigma for PQC encryption/decryption and Cryptography for RSA encryption/decryption
 * It uses Enigma for PQC signing and Cryptography for Ed25519 signing
 * It uses the master seed to derive seeds for the different algorithms using HKDF
 * Manages encryptedObjects and signedObjects to route data through the supported algorithms
 * REVIEW: Check race conditions
 * REVIEW: Check stability of the master seed transformation
 * TODO: Build a test suite for the UnifiedCrypto class
 */
export class UnifiedCrypto {
    // Multiton pattern: store multiple instances
    static supportedPQCAlgorithms = ["falcon", "ml-dsa"] as PQCAlgorithm[]
    private static instances: Map<string, UnifiedCrypto> = new Map()
    private static DEFAULT_INSTANCE_ID = "default"

    enigma: Enigma
    ed25519KeyPair: {
        publicKey: forge.pki.ed25519.NativeBuffer
        privateKey: forge.pki.ed25519.NativeBuffer
    }
    rsaKeyPair: forge.pki.rsa.KeyPair
    // This is the master seed for the unified crypto system
    masterSeed: Uint8Array
    // Instance identifier
    private instanceId: string

    private constructor(instanceId: string, masterSeed?: Uint8Array) {
        this.enigma = new Enigma()
        this.masterSeed = masterSeed
        this.instanceId = instanceId
    }

    // Multiton pattern: get an instance by ID or create a new one
    public static getInstance(
        instanceId?: string,
        masterSeed?: Uint8Array,
    ): UnifiedCrypto {
        // If no instanceId is provided, use the default instance
        const id = instanceId || UnifiedCrypto.DEFAULT_INSTANCE_ID

        // Check if the instance exists
        if (!UnifiedCrypto.instances.has(id)) {
            // Create a new instance
            UnifiedCrypto.instances.set(id, new UnifiedCrypto(id, masterSeed))
        } else if (masterSeed && !UnifiedCrypto.instances.get(id).masterSeed) {
            // Update the master seed if provided and not already set
            UnifiedCrypto.instances.get(id).masterSeed = masterSeed
        }

        return UnifiedCrypto.instances.get(id)
    }

    // Get the instance ID
    public getId(): string {
        return this.instanceId
    }

    // Get all instance IDs
    public static getInstanceIds(): string[] {
        return Array.from(UnifiedCrypto.instances.keys())
    }

    // Remove an instance
    public static removeInstance(instanceId: string): boolean {
        return UnifiedCrypto.instances.delete(instanceId)
    }

    /**
     * Ensures that the master seed is set and generates a new one if not set
     * @param masterSeed (optional) The master seed to set, or undefined to generate a new one
     */
    async ensureSeed(masterSeed?: Uint8Array): Promise<void> {
        if (!masterSeed && !this.masterSeed) {
            masterSeed = randomBytes(128)
            this.masterSeed = masterSeed
        } else if (masterSeed) {
            this.masterSeed = masterSeed
        }
        // Check if the master seed is at least 128 bytes
        if (this.masterSeed.length < 128) {
            console.log(
                "[UnifiedCrypto] WARNING: Master seed is shorter than 128 bytes; this is not recommended.",
            )
        }
    }

    /**
     * Derives a seed for the given algorithm
     * @param algorithm The algorithm to derive the seed for
     * @param seed (optional) The seed to derive the seed from, or undefined to generate a new one or use the master seed if set
     * @returns The derived seed
     */
    async deriveSeed(
        algorithm: "ed25519" | "falcon" | "ml-dsa" | "ml-kem-aes" | "rsa",
        seed?: Uint8Array,
    ): Promise<Uint8Array> {
        // Creating a new seed if none is provided and the master seed is not set
        await this.ensureSeed(seed)
        //console.log("[UnifiedCrypto] Master seed:", this.masterSeed)

        // Deriving the seed for the given algorithms

        if (algorithm === "ed25519") {
            return hkdf(sha256, this.masterSeed, "master seed", "ed25519", 32)
        } else if (algorithm === "falcon") {
            return hkdf(sha256, this.masterSeed, "master seed", "falcon", 48)
        } else if (algorithm === "ml-dsa") {
            return hkdf(sha256, this.masterSeed, "master seed", "ml-dsa", 32)
        } else if (algorithm === "ml-kem-aes") {
            return hkdf(
                sha256,
                this.masterSeed,
                "master seed",
                "ml-kem-aes",
                64,
            )
        } else if (algorithm === "rsa") {
            return hkdf(sha256, this.masterSeed, "master seed", "rsa", 32)
        } else {
            throw new Error("Invalid algorithm")
        }
    }

    // helper for all identities at once
    async generateAllIdentities(masterSeed?: Uint8Array) {
        await this.generateIdentity("ed25519", masterSeed)
        await this.generateIdentity("falcon", masterSeed)
        await this.generateIdentity("ml-dsa", masterSeed)
        await this.generateIdentity("ml-kem-aes", masterSeed)
    }

    async generateIdentity(
        algorithm: "ed25519" | "falcon" | "ml-dsa" | "ml-kem-aes" | "rsa",
        masterSeed?: Uint8Array,
    ) {
        let seed: Uint8Array
        // Generating a seed for the given algorithm
        if (masterSeed) {
            seed = await this.deriveSeed(algorithm, masterSeed)
        } else {
            seed = await this.deriveSeed(algorithm) // will either generate a new seed or use the master seed if set
        }

        // Generating the identity for the given algorithm
        if (algorithm === "ed25519") {
            this.ed25519KeyPair = Cryptography.newFromSeed(seed)
        } else if (algorithm === "falcon") {
            await this.enigma.generate_falcon_signing_keypair(seed)
        } else if (algorithm === "ml-dsa") {
            await this.enigma.generate_ml_dsa_signing_keypair(seed)
        } else if (algorithm === "ml-kem-aes") {
            await this.enigma.generate_ml_kem_encryption_keypair(seed)
        } else if (algorithm === "rsa") {
            // Using forge's prng to generate the key pair from the seed
            var prng = forge.random.createInstance()
            // Convert the seed to a string
            const seedString = new TextDecoder().decode(seed)
            prng.seedFileSync = () => seedString
            this.rsaKeyPair = await forge.pki.rsa.generateKeyPair({
                bits: 3072,
                prng,
                workers: 2,
            })
        } else {
            throw new Error("Invalid algorithm")
        }
    }

    // Getters

    async getIdentity(
        algorithm: "ed25519" | "falcon" | "ml-dsa" | "ml-kem-aes" | "rsa",
    ): Promise<{
        publicKey:
            | Uint8Array
            | forge.pki.rsa.PublicKey
            | forge.pki.ed25519.NativeBuffer
        privateKey:
            | Uint8Array
            | forge.pki.rsa.PrivateKey
            | forge.pki.ed25519.NativeBuffer
        genKey?: Uint8Array
    }> {
        if (algorithm === "falcon") {
            return this.enigma.falcon_signing_keypair
        } else if (algorithm === "ml-dsa") {
            return this.enigma.ml_dsa_signing_keypair
        } else if (algorithm === "ml-kem-aes") {
            return this.enigma.ml_kem_encryption_keypair
        } else if (algorithm === "ed25519") {
            return {
                publicKey: this.ed25519KeyPair.publicKey,
                privateKey: this.ed25519KeyPair.privateKey,
            }
        } else if (algorithm === "rsa") {
            return {
                publicKey: this.rsaKeyPair.publicKey,
                privateKey: this.rsaKeyPair.privateKey,
            }
        } else {
            throw new Error("Invalid algorithm")
        }
    }

    // Routing methods

    /**
     * Encrypts a message based on the algorithm using the previously generated identity
     * @param algorithm The algorithm to encrypt the message with
     * @param data The message to encrypt
     * @param peerPublicKey The public key of the peer to encrypt the message to
     * @returns The encrypted object as an encryptedObject
     */
    async encrypt(
        algorithm: "ml-kem-aes" | "rsa",
        data: Uint8Array,
        peerPublicKey: Uint8Array,
    ): Promise<encryptedObject> {
        let encryptedObject: encryptedObject = {
            algorithm: algorithm,
            encryptedData: new Uint8Array(),
        }
        // Routing through the unified crypto system
        if (algorithm === "ml-kem-aes") {
            const { cipherText, encryptedMessage } =
                await this.enigma.encrypt_ml_kem_aes(data, peerPublicKey)
            encryptedObject.cipherText = cipherText
            encryptedObject.encryptedData = encryptedMessage
        } else if (algorithm === "rsa") {
            if (!this.rsaKeyPair) {
                throw new Error("RSA key pair not generated")
            }
            // Convert the data to a string
            const dataString = new TextDecoder().decode(data)
            let encryptedData = this.rsaKeyPair.publicKey.encrypt(dataString)
            // Convert the encrypted data to a Uint8Array
            encryptedObject.encryptedData = new TextEncoder().encode(
                encryptedData,
            )
        }
        return encryptedObject
    }

    /**
     * Signs a message based on the algorithm using the previously generated identity
     * @param algorithm The algorithm to sign the message with
     * @param data The message to sign
     * @returns The signed object as a signedObject
     */
    async sign(
        algorithm: "ml-dsa" | "falcon" | "ed25519",
        data: Uint8Array,
    ): Promise<signedObject> {
        let signedObject: signedObject
        if (algorithm === "ed25519") {
            if (!this.ed25519KeyPair) {
                throw new Error("Ed25519 key pair not generated")
            }
            signedObject = {
                algorithm: "ed25519",
                signature: Cryptography.sign(
                    new TextDecoder().decode(data),
                    this.ed25519KeyPair.privateKey,
                ),
                message: data,
                publicKey: this.ed25519KeyPair.publicKey,
            } as Ed25519SignedObject
        } else if (algorithm === "ml-dsa") {
            signedObject = {
                algorithm: algorithm,
                signature: await this.enigma.sign_ml_dsa(data),
                message: data,
                publicKey: this.enigma.ml_dsa_signing_keypair.publicKey,
            } as PqcSignedObject
        } else if (algorithm === "falcon") {
            let dataString = new TextDecoder().decode(data)
            signedObject = {
                algorithm: algorithm,
                signature: await this.enigma.sign_falcon(dataString),
                message: data,
                publicKey: this.enigma.falcon_signing_keypair.publicKey,
            } as PqcSignedObject
        }
        return signedObject
    }

    /**
     * Decrypts an encrypted object based on the algorithm
     * @param encryptedObject The encrypted object to decrypt
     * @returns The decrypted data
     */
    async decrypt(encryptedObject: encryptedObject): Promise<Uint8Array> {
        if (encryptedObject.algorithm === "ml-kem-aes") {
            return this.enigma.decrypt_ml_kem_aes(
                encryptedObject.encryptedData,
                encryptedObject.cipherText,
            )
        } else if (encryptedObject.algorithm === "rsa") {
            // Convert the encrypted data to a string
            const encryptedDataString = new TextDecoder().decode(
                encryptedObject.encryptedData,
            )
            let decryptedData =
                this.rsaKeyPair.privateKey.decrypt(encryptedDataString)
            // Convert the decrypted data to a Uint8Array
            return new TextEncoder().encode(decryptedData)
        } else {
            throw new Error("Invalid algorithm")
        }
    }

    /**
     * Verifies a signed object based on the algorithm
     * @param signedObject The signed object to verify
     * @returns True if the signed object is valid, false otherwise
     * @throws Error if publicKey is not in the expected format for the algorithm
     */
    async verify(signedObject: signedObject): Promise<boolean> {
        if (signedObject.algorithm === "ml-dsa") {
            return await Enigma.verify_ml_dsa(
                signedObject.signature,
                signedObject.message,
                signedObject.publicKey as Uint8Array,
            )
        } else if (signedObject.algorithm === "falcon") {
            // Convert the message to a string
            const messageString = new TextDecoder().decode(signedObject.message)
            return await Enigma.verify_falcon(
                signedObject.signature,
                messageString,
                signedObject.publicKey as Uint8Array,
            )
        } else if (signedObject.algorithm === "ed25519") {
            /*if (!isForgePublicKey(signedObject.publicKey)) {
                throw new Error(
                    "Ed25519 verification requires a forge.pki.PublicKey",
                )
            }*/
            // Convert the message to a string
            const messageString = new TextDecoder().decode(signedObject.message)
            return Cryptography.verify(
                messageString,
                signedObject.signature,
                signedObject.publicKey,
            )
        } else {
            throw new Error("Invalid algorithm")
        }
    }
}

// Create a proxy that automatically calls getInstance with the default instance
// and also provides access to static methods
export const unifiedCrypto = new Proxy(
    {} as UnifiedCrypto & typeof UnifiedCrypto,
    {
        get(target, prop) {
            // Check if the property is a static method or property
            if (
                prop in UnifiedCrypto &&
                typeof UnifiedCrypto[prop as keyof typeof UnifiedCrypto] ===
                    "function"
            ) {
                // Return the static method bound to the UnifiedCrypto class
                return (
                    UnifiedCrypto[
                        prop as keyof typeof UnifiedCrypto
                    ] as Function
                ).bind(UnifiedCrypto)
            }

            // For instance methods and properties, get the default instance
            const instance = UnifiedCrypto.getInstance()
            const value = instance[prop as keyof UnifiedCrypto]

            // If it's a method, bind it to the instance
            if (typeof value === "function") {
                return value.bind(instance)
            }

            return value
        },
    },
)

// Export a function to get a named instance
export function getUnifiedCryptoInstance(
    instanceId: string,
    masterSeed?: Uint8Array,
): UnifiedCrypto {
    return UnifiedCrypto.getInstance(instanceId, masterSeed)
}
