import { describe, test, expect, beforeEach } from "bun:test"
import {
    unifiedCrypto,
    getUnifiedCryptoInstance,
    encryptedObject,
    signedObject,
    isForgePublicKey,
} from "../../encryption/unifiedCrypto"
import { randomBytes } from "@noble/hashes/utils"

// Reset the instances before each test
beforeEach(() => {
    // Clear all instances
    const instanceIds = unifiedCrypto.getInstanceIds()
    instanceIds.forEach(id => {
        unifiedCrypto.removeInstance(id)
    })
})

describe("UnifiedCrypto Multiton", () => {
    test("should maintain separate state for different instances", async () => {
        // Generate a random master seed
        const masterSeed1 = randomBytes(32)
        const masterSeed2 = randomBytes(32)

        // Create two different instances
        const instance1 = getUnifiedCryptoInstance("instance1", masterSeed1)
        const instance2 = getUnifiedCryptoInstance("instance2", masterSeed2)

        console.log(instance1.masterSeed)
        console.log(instance2.masterSeed)

        // Generate identities for both instances
        await instance1.generateIdentity("ed25519")
        await instance2.generateIdentity("ed25519")

        console.log(instance1.getIdentity("ed25519"))
        console.log(instance2.getIdentity("ed25519"))

        // Get the identities
        const identity1 = await instance1.getIdentity("ed25519")
        const identity2 = await instance2.getIdentity("ed25519")

        // The public keys should be different
        expect(identity1.publicKey).not.toEqual(identity2.publicKey)
    })

    test("should maintain the default instance through the proxy", async () => {
        // Generate a random master seed
        const masterSeed = randomBytes(32)

        // Use the proxy to access the default instance
        await unifiedCrypto.generateIdentity("ed25519", masterSeed)
        const identity1 = await unifiedCrypto.getIdentity("ed25519")

        // Create a new instance with the same seed
        const instance2 = getUnifiedCryptoInstance("instance2", masterSeed)
        await instance2.generateIdentity("ed25519")
        const identity2 = await instance2.getIdentity("ed25519")

        // The public keys should be the same (same seed)
        expect(identity1.publicKey).toEqual(identity2.publicKey)
    })

    test("should allow removing instances", async () => {
        // Create an instance
        const instance = getUnifiedCryptoInstance("test-instance")

        // Verify it exists
        expect(unifiedCrypto.getInstanceIds()).toContain("test-instance")

        // Remove it
        unifiedCrypto.removeInstance("test-instance")

        // Verify it's gone
        expect(unifiedCrypto.getInstanceIds()).not.toContain("test-instance")
    })
})

describe("Seed Derivation", () => {
    test("should derive different seeds for different algorithms", async () => {
        const masterSeed = randomBytes(32)
        const seed1 = await unifiedCrypto.deriveSeed("ed25519", masterSeed)
        const seed2 = await unifiedCrypto.deriveSeed("rsa", masterSeed)
        expect(seed1).not.toEqual(seed2)
    })

    test("should generate a random seed if none is provided", async () => {
        const seed = await unifiedCrypto.deriveSeed("ed25519")
        expect(seed).toBeDefined()
        expect(seed.length).toBe(32)
    })

    test("should use the master seed if available", async () => {
        const masterSeed = randomBytes(32)
        await unifiedCrypto.generateIdentity("ed25519", masterSeed)
        const seed = await unifiedCrypto.deriveSeed("ed25519")
        expect(seed).toBeDefined()
        expect(seed.length).toBe(32)
    })
})

describe("Key Generation", () => {
    test("should generate Ed25519 keys", async () => {
        await unifiedCrypto.generateIdentity("ed25519")
        const identity = await unifiedCrypto.getIdentity("ed25519")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate RSA keys", async () => {
        await unifiedCrypto.generateIdentity("rsa")
        const identity = await unifiedCrypto.getIdentity("rsa")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate ML-KEM-AES keys", async () => {
        await unifiedCrypto.generateIdentity("ml-kem-aes")
        const identity = await unifiedCrypto.getIdentity("ml-kem-aes")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate ML-DSA keys", async () => {
        await unifiedCrypto.generateIdentity("ml-dsa")
        const identity = await unifiedCrypto.getIdentity("ml-dsa")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate Falcon keys", async () => {
        await unifiedCrypto.generateIdentity("falcon")
        const identity = await unifiedCrypto.getIdentity("falcon")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate consistent keys with the same seed", async () => {
        const masterSeed = randomBytes(32)
        await unifiedCrypto.generateIdentity("ed25519", masterSeed)
        const identity1 = await unifiedCrypto.getIdentity("ed25519")

        // Create a new instance with the same seed
        const instance2 = getUnifiedCryptoInstance("instance2", masterSeed)
        await instance2.generateIdentity("ed25519")
        const identity2 = await instance2.getIdentity("ed25519")

        // The public keys should be the same
        expect(identity1.publicKey).toEqual(identity2.publicKey)
    })
})

describe("Encryption and Decryption", () => {
    test("should encrypt and decrypt data with RSA", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("rsa")
        const data = new TextEncoder().encode("Hello, world!")

        // Get the public key for encryption
        const identity = await unifiedCrypto.getIdentity("rsa")
        const publicKey = identity.publicKey

        // Encrypt
        const encrypted = await unifiedCrypto.encrypt(
            "rsa",
            data,
            publicKey as Uint8Array,
        )
        expect(encrypted.algorithm).toBe("rsa")
        expect(encrypted.encryptedData).toBeDefined()

        // Decrypt
        const decrypted = await unifiedCrypto.decrypt(encrypted)
        expect(decrypted).toEqual(data)
    })

    test("should encrypt and decrypt data with ML-KEM-AES", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("ml-kem-aes")
        const data = new TextEncoder().encode("Hello, world!")

        // Get the public key for encryption
        const identity = await unifiedCrypto.getIdentity("ml-kem-aes")
        const publicKey = identity.publicKey

        // Encrypt
        const encrypted = await unifiedCrypto.encrypt(
            "ml-kem-aes",
            data,
            publicKey as Uint8Array,
        )
        expect(encrypted.algorithm).toBe("ml-kem-aes")
        expect(encrypted.encryptedData).toBeDefined()
        expect(encrypted.cipherText).toBeDefined()

        // Decrypt
        const decrypted = await unifiedCrypto.decrypt(encrypted)
        expect(decrypted).toEqual(data)
    })

    test("should throw an error when trying to encrypt with RSA without generating keys", async () => {
        const data = new TextEncoder().encode("Hello, world!")
        const publicKey = new Uint8Array(32)
        await expect(
            unifiedCrypto.encrypt("rsa", data, publicKey),
        ).rejects.toThrow()
    })
})

describe("Signing and Verification", () => {
    test("should sign and verify data with Ed25519", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("ed25519")
        const data = new TextEncoder().encode("Hello, world!")

        // Sign
        const signed = await unifiedCrypto.sign("ed25519", data)
        expect(signed.algorithm).toBe("ed25519")
        expect(signed.signedData).toBeDefined()
        expect(signed.publicKey).toBeDefined()
        expect(isForgePublicKey(signed.publicKey)).toBe(true)

        // Verify
        const isValid = await unifiedCrypto.verify(signed)
        expect(isValid).toBe(true)
    })

    test("should sign and verify data with ML-DSA", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("ml-dsa")
        const data = new TextEncoder().encode("Hello, world!")

        // Sign
        const signed = await unifiedCrypto.sign("ml-dsa", data)
        expect(signed.algorithm).toBe("ml-dsa")
        expect(signed.signedData).toBeDefined()
        expect(signed.publicKey).toBeDefined()
        expect(isForgePublicKey(signed.publicKey)).toBe(false)

        // Verify
        const isValid = await unifiedCrypto.verify(signed)
        expect(isValid).toBe(true)
    })

    test("should sign and verify data with Falcon", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("falcon")
        const data = new TextEncoder().encode("Hello, world!")

        // Sign
        const signed = await unifiedCrypto.sign("falcon", data)
        expect(signed.algorithm).toBe("falcon")
        expect(signed.signedData).toBeDefined()
        expect(signed.publicKey).toBeDefined()
        expect(isForgePublicKey(signed.publicKey)).toBe(false)

        // Verify
        const isValid = await unifiedCrypto.verify(signed)
        expect(isValid).toBe(true)
    })

    test("should detect invalid signatures", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("ed25519")
        const data = new TextEncoder().encode("Hello, world!")

        // Sign
        const signed = await unifiedCrypto.sign("ed25519", data)

        // Modify the signature to make it invalid
        const modifiedSigned = { ...signed }
        modifiedSigned.signedData = new Uint8Array(signed.signedData.length)

        // Verify
        const isValid = await unifiedCrypto.verify(modifiedSigned)
        expect(isValid).toBe(false)
    })

    test("should throw an error when verifying with an invalid public key type", async () => {
        // Setup
        await unifiedCrypto.generateIdentity("ed25519")
        const data = new TextEncoder().encode("Hello, world!")

        // Sign
        const signed = await unifiedCrypto.sign("ed25519", data)

        // Modify the public key to make it invalid
        const modifiedSigned = { ...signed }
        modifiedSigned.publicKey = new Uint8Array(32)

        // Verify should throw an error
        await expect(unifiedCrypto.verify(modifiedSigned)).rejects.toThrow()
    })
})

describe("Proxy Export", () => {
    test("should provide access to all methods", async () => {
        expect(typeof unifiedCrypto.generateIdentity).toBe("function")
        expect(typeof unifiedCrypto.deriveSeed).toBe("function")
        expect(typeof unifiedCrypto.encrypt).toBe("function")
        expect(typeof unifiedCrypto.decrypt).toBe("function")
        expect(typeof unifiedCrypto.sign).toBe("function")
        expect(typeof unifiedCrypto.verify).toBe("function")
    })

    test("should maintain singleton behavior for the default instance", async () => {
        const masterSeed = randomBytes(32)
        await unifiedCrypto.generateIdentity("ed25519", masterSeed)
        const identity1 = await unifiedCrypto.getIdentity("ed25519")

        // Create a new instance with the same seed
        const instance2 = getUnifiedCryptoInstance("instance2", masterSeed)
        await instance2.generateIdentity("ed25519")
        const identity2 = await instance2.getIdentity("ed25519")

        // The public keys should be the same
        expect(identity1.publicKey).toEqual(identity2.publicKey)
    })
})
