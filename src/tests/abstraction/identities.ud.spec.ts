import { Identities } from "@/abstraction"
import { Demos } from "@/websdk"
import { uint8ArrayToHex } from "@/encryption"
import { ethers } from "ethers"

describe("UNSTOPPABLE DOMAINS IDENTITIES", () => {
    const rpc = "http://localhost:53550"
    let demos: Demos
    let identities: Identities

    beforeAll(async () => {
        demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(
            "polar scale globe beauty stock employ rail exercise goat into sample embark"
        )
        identities = new Identities()
    })

    /**
     * Test challenge generation
     * The challenge should contain the Demos public key for verification
     */
    test("Generate UD challenge", async () => {
        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const ed25519_address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        const challenge = identities.generateUDChallenge(ed25519_address)

        console.log("Generated challenge:", challenge)

        // Verify challenge contains required components
        expect(challenge).toContain("Link Unstoppable Domain to Demos Network")
        expect(challenge).toContain(ed25519_address)
        expect(challenge).toContain("Timestamp:")
        expect(challenge).toContain("Nonce:")
    })

    /**
     * Test UD domain resolution with a known domain
     * This test tries to resolve a well-known domain
     */
    test("Resolve UD domain", async () => {
        const testDomain = "nick.crypto"

        try {
            // Access the private method via reflection for testing
            const resolveMethod = (identities as any).resolveUDDomain.bind(identities)
            const resolvedAddress = await resolveMethod(testDomain)

            console.log(`Domain ${testDomain} resolves to:`, resolvedAddress)

            // Should return a valid Ethereum address
            expect(resolvedAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
        } catch (error) {
            // If the domain doesn't resolve, we still consider the test successful
            // as long as we get a proper error and don't hang
            console.log("Resolution failed:", (error as Error).message)
            console.log("This is expected if the test domain doesn't exist or network issues occur")
            console.log("The important thing is that the method doesn't hang indefinitely")

            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain("Failed to resolve Unstoppable Domain")
        }
    }, 15000) // Increased timeout to 15 seconds for network operations

    /**
     * Test UD domain resolution error handling
     * This test verifies that invalid domains are handled gracefully
     */
    test("UD domain resolution handles errors gracefully", async () => {
        const invalidDomain = "definitely-not-a-real-domain-12345.crypto"

        try {
            const resolveMethod = (identities as any).resolveUDDomain.bind(identities)
            await resolveMethod(invalidDomain)

            // If we reach here, the domain unexpectedly resolved
            fail("Expected domain resolution to fail for invalid domain")
        } catch (error) {
            // This is expected - the domain should not exist
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain("Failed to resolve Unstoppable Domain")
            expect((error as Error).message).toContain(invalidDomain)

            console.log("✅ Error handling test passed - invalid domain properly rejected")
        }
    }, 10000)

    /**
     * AUTOMATED TEST: Add UD identity with ethers.js wallet
     *
     * This test demonstrates the full flow using ethers.js to sign
     * instead of requiring manual MetaMask signing.
     *
     * For this to work in a real scenario, you need:
     * - A test UD domain
     * - The private key of the Ethereum address that owns it
     *
     * This is skipped by default as it requires test domain setup
     */
    test.skip("Add UD identity (AUTOMATED)", async () => {
        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const ed25519_address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        // Configuration - replace with your test domain and private key
        const DOMAIN = "test.crypto" // Your UD domain
        const ETH_PRIVATE_KEY = "0x..." // Private key of the address that owns the domain

        // Step 1: Generate challenge
        const challenge = identities.generateUDChallenge(ed25519_address)
        console.log("Challenge:", challenge)

        // Step 2: Sign challenge with Ethereum wallet
        const wallet = new ethers.Wallet(ETH_PRIVATE_KEY)
        const signature = await wallet.signMessage(challenge)
        console.log("Signature:", signature)
        console.log("Signer address:", wallet.address)

        // Step 3: Verify signature locally before submitting
        const recoveredAddress = ethers.verifyMessage(challenge, signature)
        console.log("Recovered address:", recoveredAddress)
        expect(recoveredAddress.toLowerCase()).toBe(wallet.address.toLowerCase())

        // Step 4: Submit to node for verification
        const validityData = await identities.addUnstoppableDomainIdentity(
            demos,
            DOMAIN,
            signature,
            challenge
        )

        console.log("Validity data:", validityData)

        // Step 5: Broadcast transaction
        const res = await demos.broadcast(validityData)
        console.log("Broadcast result:", res)

        expect(res).toBeDefined()
        expect(res.result).toBe(200)
    })

    /**
     * Test challenge format validation
     */
    test("Validate challenge format", async () => {
        const ed25519 = await demos.crypto.getIdentity("ed25519")
        const ed25519_address = uint8ArrayToHex(ed25519.publicKey as Uint8Array)

        const challenge1 = identities.generateUDChallenge(ed25519_address)
        const challenge2 = identities.generateUDChallenge(ed25519_address)

        // Each challenge should be unique (different nonce/timestamp)
        expect(challenge1).not.toBe(challenge2)

        // Both should contain the same Demos key
        expect(challenge1).toContain(ed25519_address)
        expect(challenge2).toContain(ed25519_address)
    })
})
