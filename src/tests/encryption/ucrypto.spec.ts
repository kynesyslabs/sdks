// import { describe, test, expect, beforeEach } from "bun:test"
import { Hashing } from "@/encryption"
import {
    unifiedCrypto,
    getUnifiedCryptoInstance,
    encryptedObject,
    signedObject,
    uint8ArrayToHex,
    hexToUint8Array,
} from "../../encryption/unifiedCrypto"
import { randomBytes } from "@noble/hashes/utils"
import * as bip39 from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
import { sha3_256, sha3_512 } from "@noble/hashes/sha3"
import { Demos } from "@/websdk/demosclass"

// Reset the instances before each test
beforeEach(() => {
    // Clear all instances
    const instanceIds = unifiedCrypto.getInstanceIds()
    instanceIds.forEach(id => {
        unifiedCrypto.removeInstance(id)
    })
})

describe("randomBytes generation performance", () => {
    test("should generate random bytes quickly and derive a seed in a reasonable time (less than 1000ms)", async () => {
        const startTime = performance.now()
        const rndBytes = randomBytes(128)
        const endTime = performance.now()
        const randomBytesGenerationTime = endTime - startTime
        // Generating a ed25519 seed from the random bytes
        const startTime2 = performance.now()
        const seed = await unifiedCrypto.deriveSeed("ed25519", rndBytes)
        const endTime2 = performance.now()
        const seedGenerationTime = endTime2 - startTime2
        console.log(
            `Time taken to generate random bytes: ${randomBytesGenerationTime}ms`,
        )
        console.log(`Time taken to generate seed: ${seedGenerationTime}ms`)
        if (randomBytesGenerationTime > 1000) {
            console.log(
                "[WARNING] randomBytes generation is taking too long: ${randomBytesGenerationTime}ms",
            )
        }
        if (seedGenerationTime > 1000) {
            console.log(
                "[WARNING] seed generation is taking too long: ${seedGenerationTime}ms",
            )
        }
        expect(randomBytesGenerationTime).toBeLessThan(1000)
        expect(seedGenerationTime).toBeLessThan(1000)
    })
})

describe("UnifiedCrypto Multiton", () => {
    test("should maintain separate state for different instances", async () => {
        // Generate a random master seed
        const masterSeed1 = randomBytes(128)
        const masterSeed2 = randomBytes(128)

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
        const masterSeed = randomBytes(128)

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
        const masterSeed = randomBytes(128)
        const seed1 = await unifiedCrypto.deriveSeed("ed25519", masterSeed)
        const seed2 = await unifiedCrypto.deriveSeed("ml-dsa", masterSeed)
        expect(seed1).not.toEqual(seed2)
    })

    test("should generate a random seed if none is provided", async () => {
        const seed = await unifiedCrypto.deriveSeed("ed25519")
        expect(seed).toBeDefined()
        expect(seed.length).toBe(32)
    })

    test("should use the master seed if available", async () => {
        const masterSeed = randomBytes(128)
        await unifiedCrypto.generateIdentity("ed25519", masterSeed)
        const seed = await unifiedCrypto.deriveSeed("ed25519")
        expect(seed).toBeDefined()
        expect(seed.length).toBe(32)
    })
})

describe("Key Generation", () => {
    test.skip("should generate Ed25519 keys", async () => {
        await unifiedCrypto.generateIdentity("ed25519")
        const identity = await unifiedCrypto.getIdentity("ed25519")

        console.log("master seed length", unifiedCrypto.masterSeed.length)
        console.log("master seed hex", uint8ArrayToHex(unifiedCrypto.masterSeed))
        console.log("master seed back", hexToUint8Array(uint8ArrayToHex(unifiedCrypto.masterSeed)).length)

        expect(unifiedCrypto.masterSeed).toEqual(hexToUint8Array(uint8ArrayToHex(unifiedCrypto.masterSeed)))
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    /* test("should generate RSA keys", async () => {
        await unifiedCrypto.generateIdentity("rsa")
        const identity = await unifiedCrypto.getIdentity("rsa")
        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    }) */

    test("should generate ML-KEM-AES keys", async () => {
        await unifiedCrypto.generateIdentity("ml-kem-aes")
        const identity = await unifiedCrypto.getIdentity("ml-kem-aes")

        // console.log("public key", uint8ArrayToHex(identity.publicKey))
        // console.log("private key", uint8ArrayToHex(identity.privateKey))

        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate ML-DSA keys", async () => {
        await unifiedCrypto.generateIdentity("ml-dsa")
        const identity = await unifiedCrypto.getIdentity("ml-dsa")

        // console.log("public key", uint8ArrayToHex(identity.publicKey))
        // console.log("private key", uint8ArrayToHex(identity.privateKey))

        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test.only("should generate Falcon keys", async () => {
        const seed = "entire vocal party hold witness glimpse damp cat small type whale cry";
        const mnemonic = bip39.generateMnemonic(wordlist, 128)

        const seedBuffer = bip39.mnemonicToSeedSync(seed)
        console.log("wordlist length", wordlist.length)
        console.log("seed buffer length", seedBuffer.length)
        console.log("mnemonic", mnemonic.length)
        const seedBytes = new TextEncoder().encode(Hashing.sha256(seedBuffer.toString()))


        console.log("seed length", seedBytes.length)
        await unifiedCrypto.generateIdentity("falcon", seedBytes)
        const identity = await unifiedCrypto.getIdentity("falcon")

        // console.log("falcon public key", uint8ArrayToHex(identity.publicKey))
        // console.log("falcon private key", uint8ArrayToHex(identity.privateKey))

        expect(identity.publicKey).toBeDefined()
        expect(identity.privateKey).toBeDefined()
    })

    test("should generate consistent keys with the same seed", async () => {
        const masterSeed = randomBytes(128)
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
    /* test("should encrypt and decrypt data with RSA", async () => {
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
    }) */

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

    /*test("should throw an error when trying to encrypt with RSA without generating keys", async () => {
        const data = new TextEncoder().encode("Hello, world!")
        const publicKey = new Uint8Array(32)
        await expect(
            unifiedCrypto.encrypt("rsa", data, publicKey),
        ).rejects.toThrow()
    }) */
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
        let isOriginalValid = await unifiedCrypto.verify(signed)
        let isValid = await unifiedCrypto.verify(modifiedSigned)
        expect(isOriginalValid).toBe(true)
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
        modifiedSigned.publicKey = new Uint8Array(15)

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
        const masterSeed = randomBytes(128)
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

describe.only("Mnemonic to Buffer Conversion", () => {
    test("should convert 12-word mnemonic to 128-byte buffer", async () => {
        const mnemonic = "entire vocal party hold witness glimpse damp cat small type whale cry";
        const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);

        const hash = sha3_512(seedBuffer)
        console.log("hash", uint8ArrayToHex(hash).length)
        // const hashBuffer = Buffer.from(hash, "hex");
        console.log("hash buffer length", hash.length)
    });

    test.only("NEW demos rewrite", async () => {
        const demos = new Demos()
        await demos.connectWallet("entire vocal party hold witness glimpse damp cat small type whale cry")
    })
})
