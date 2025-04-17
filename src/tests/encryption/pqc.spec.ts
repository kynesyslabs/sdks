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

// TODO Add falcon signatures test
// TODO Add ml-kem tests
// TODO Add ml-kem-aes tests

console.log(">>>> results <<<<")
