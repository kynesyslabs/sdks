import { describe, test, expect, beforeEach } from "bun:test"
import { Enigma } from "@/encryption/PQC/enigma"
import { randomBytes } from "crypto"
import { performance } from "perf_hooks"

// SECTION 1: Hashing with SHA-3
console.log(">>>> SHA-3 Hashing tests in progress <<<<")
let startTimeSHA3 = performance.now()
describe("Hashing with SHA-3", () => {
    test("should hash a message", async () => {
        let hash = await Enigma.hash("Hello, world!")
        expect(hash).toBeDefined()
    })
})
let endTimeSHA3 = performance.now()
console.log(`SHA-3 Hashing tests completed in ${endTimeSHA3 - startTimeSHA3}ms`)

// SECTION 2: ml-dsa
console.log(">>>> ml-dsa tests in progress <<<<")
let startTimeMLDSA = performance.now()

describe("ml-dsa", () => {
    test("Should generate a keypair", async () => {
        let enigma = new Enigma()
        await enigma.generate_ml_dsa_signing_keypair()
        expect(enigma.ml_dsa_signing_keypair).toBeDefined()
    })

    test("Should generate a keypair with a seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(32)
        await enigma.generate_ml_dsa_signing_keypair(seed)
        expect(enigma.ml_dsa_signing_keypair).toBeDefined()
    })

    test("Should generate two identical keypairs with the same seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(32)
        await enigma.generate_ml_dsa_signing_keypair(seed)
        let enigma2 = new Enigma()
        await enigma2.generate_ml_dsa_signing_keypair(seed)
        expect(enigma.ml_dsa_signing_keypair).toEqual(
            enigma2.ml_dsa_signing_keypair,
        )
    })

    test("Should sign a message", async () => {
        let enigma = new Enigma()
        await enigma.generate_ml_dsa_signing_keypair()
        let message = randomBytes(32)
        let signature = await enigma.sign_ml_dsa(message)
        expect(signature).toBeDefined()
    })

    test("Should verify a signature", async () => {
        let enigma = new Enigma()
        await enigma.generate_ml_dsa_signing_keypair()
        let message = randomBytes(32)
        let signature = await enigma.sign_ml_dsa(message)
        let isValid = await Enigma.verify_ml_dsa(
            signature,
            message,
            enigma.ml_dsa_signing_keypair.publicKey,
        )
        expect(isValid).toBe(true)
    })
})
let endTimeMLDSA = performance.now()
console.log(`ml-dsa tests completed in ${endTimeMLDSA - startTimeMLDSA}ms`)

// SECTION 3: falcon

console.log(">>>> falcon tests in progress <<<<")
let startTimeFalcon = performance.now()
describe("falcon", () => {
    test("Should generate a keypair", async () => {
        let enigma = new Enigma()
        await enigma.generate_falcon_signing_keypair()
        expect(enigma.falcon_signing_keypair).toBeDefined()
    })
    test("Should generate a keypair with a seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(48)
        await enigma.generate_falcon_signing_keypair(seed)
        expect(enigma.falcon_signing_keypair).toBeDefined()
    })
    test("Should generate two identical keypairs with the same seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(48)
        await enigma.generate_falcon_signing_keypair(seed)
        let enigma2 = new Enigma()
        await enigma2.generate_falcon_signing_keypair(seed)
        expect(enigma.falcon_signing_keypair).toEqual(
            enigma2.falcon_signing_keypair,
        )
    })
    test("Should sign a message", async () => {
        let enigma = new Enigma()
        await enigma.generate_falcon_signing_keypair()
        let message = randomBytes(32)
        let stringMessage = message.toString("hex")
        let signature = await enigma.sign_falcon(stringMessage)
        expect(signature).toBeDefined()
    })
    test("Should verify a signature", async () => {
        let enigma = new Enigma()
        await enigma.generate_falcon_signing_keypair()
        let message = randomBytes(32)
        let stringMessage = message.toString("hex")
        let signature = await enigma.sign_falcon(stringMessage)
        let isValid = await Enigma.verify_falcon(
            signature,
            stringMessage,
            enigma.falcon_signing_keypair.publicKey,
        )
    })
})
let endTimeFalcon = performance.now()
console.log(`falcon tests completed in ${endTimeFalcon - startTimeFalcon}ms`)

// SECTION 4: ml-kem

console.log(">>>> ml-kem tests in progress <<<<")
let startTimeMLKEM = performance.now()

describe("ml-kem", () => {
    test("Should generate a keypair", async () => {
        let enigma = new Enigma()
        await enigma.generate_ml_kem_encryption_keypair()
        expect(enigma.ml_kem_encryption_keypair).toBeDefined()
    })
    test("Should generate a keypair with a seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(64)
        await enigma.generate_ml_kem_encryption_keypair(seed)
        expect(enigma.ml_kem_encryption_keypair).toBeDefined()
    })
    test("Should generate two identical keypairs with the same seed", async () => {
        let enigma = new Enigma()
        let seed = randomBytes(64)
        await enigma.generate_ml_kem_encryption_keypair(seed)
        let enigma2 = new Enigma()
        await enigma2.generate_ml_kem_encryption_keypair(seed)
        expect(enigma.ml_kem_encryption_keypair).toEqual(
            enigma2.ml_kem_encryption_keypair,
        )
    })
    test("Should encapsulate a secret given a public key", async () => {
        let enigma = new Enigma()
        await enigma.generate_ml_kem_encryption_keypair()
        let enigma2 = new Enigma()
        await enigma2.generate_ml_kem_encryption_keypair()
        let secret = randomBytes(32)
        let { cipherText, sharedSecret } = await enigma.encapsulate_ml_kem(
            enigma2.ml_kem_encryption_keypair.publicKey,
        )
        expect(cipherText).toBeDefined()
        expect(sharedSecret).toBeDefined()
    })
    test("Should decapsulate a secret given a cipher text", async () => {
        let alice = new Enigma()
        await alice.generate_ml_kem_encryption_keypair()
        let bob = new Enigma()
        await bob.generate_ml_kem_encryption_keypair()
        let { cipherText, sharedSecret } = await alice.encapsulate_ml_kem(
            bob.ml_kem_encryption_keypair.publicKey,
        )
        let decapsulatedSecret = await bob.decapsulate_ml_kem(cipherText)
        expect(decapsulatedSecret).toEqual(sharedSecret)
    })
})

let endTimeMLKEM = performance.now()
console.log(`ml-kem tests completed in ${endTimeMLKEM - startTimeMLKEM}ms`)

// TODO Add ml-kem-aes tests
let startTimeMLKEMAES = performance.now()
console.log(">>>> ml-kem-aes tests in progress <<<<")

describe("ml-kem-aes", () => {
    test("Should encrypt a message", async () => {
        let alice = new Enigma()
        await alice.generate_ml_kem_encryption_keypair()
        let bob = new Enigma()
        await bob.generate_ml_kem_encryption_keypair()
        let message = randomBytes(32)
        let encryptedMessage = await alice.encrypt_ml_kem_aes(
            message,
            bob.ml_kem_encryption_keypair.publicKey,
        )
        expect(encryptedMessage).toBeDefined()
    })
    test("Should decrypt a message", async () => {
        let alice = new Enigma()
        await alice.generate_ml_kem_encryption_keypair()
        let bob = new Enigma()
        await bob.generate_ml_kem_encryption_keypair()
        let message = randomBytes(32)
        let encryptedMessage = await alice.encrypt_ml_kem_aes(
            message,
            bob.ml_kem_encryption_keypair.publicKey,
        )
        let decryptedMessage = await bob.decrypt_ml_kem_aes(
            encryptedMessage.encryptedMessage,
            encryptedMessage.cipherText,
        )
        expect(decryptedMessage).toEqual(message)
    })
})

let endTimeMLKEMAES = performance.now()
console.log(
    `ml-kem-aes tests completed in ${endTimeMLKEMAES - startTimeMLKEMAES}ms`,
)

console.log(">>>> results <<<<")
