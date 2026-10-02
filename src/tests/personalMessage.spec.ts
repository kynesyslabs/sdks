import { Demos, personalMessagePreimage } from "@/websdk"
import { hexToUint8Array, uint8ArrayToHex } from "@/encryption/unifiedCrypto"

/**
 * A transaction signature covers `TextEncoder(tx.hash)` — a 64-char hex
 * digest. Before domain separation, `signMessage("<that digest>")` produced
 * the identical bytes, so a site that chose the "login challenge" chose a
 * transaction hash instead and kept a usable transaction signature.
 */
const TX_HASH = "9f".repeat(32)

async function connectedDemos() {
    const demos = new Demos()
    await demos.connectWallet(
        "test test test test test test test test test test test junk",
        { algorithm: "ed25519" },
    )
    return demos
}

describe("personalMessagePreimage", () => {
    it("prefixes the domain and the byte length", () => {
        const preimage = personalMessagePreimage("hello")

        expect(new TextDecoder().decode(preimage)).toBe(
            "\x19Demos Signed Message:\n5hello",
        )
    })

    it("counts bytes, not characters", () => {
        // "é" is two bytes in UTF-8: a character count would let a different
        // message re-cut to the same preimage.
        const preimage = new TextDecoder().decode(
            personalMessagePreimage("é"),
        )

        expect(preimage).toBe("\x19Demos Signed Message:\n2é")
    })

    it("accepts bytes as given", () => {
        const preimage = personalMessagePreimage(new Uint8Array([1, 2, 3]))

        expect(preimage.slice(-3)).toEqual(new Uint8Array([1, 2, 3]))
    })
})

describe("signMessage domain separation", () => {
    it("does not produce a valid transaction signature for the signed digest", async () => {
        const demos = await connectedDemos()
        const address = demos.getAddress()

        const { data } = await demos.signMessage(TX_HASH, {
            algorithm: "ed25519",
            personal: true,
        })

        // What a node does with a transaction: verify over the bare hash bytes.
        const asTransactionSignature = await demos.crypto.verify({
            algorithm: "ed25519",
            signature: hexToUint8Array(data),
            publicKey: hexToUint8Array(address),
            message: new TextEncoder().encode(TX_HASH),
        })

        expect(asTransactionSignature).toBe(false)
    })

    it("round-trips a personal signature through verifyMessage", async () => {
        const demos = await connectedDemos()

        const { data } = await demos.signMessage(TX_HASH, {
            algorithm: "ed25519",
            personal: true,
        })

        await expect(
            demos.verifyMessage(TX_HASH, data, demos.getAddress(), {
                algorithm: "ed25519",
                personal: true,
            }),
        ).resolves.toBe(true)
        // A verifier on the bare bytes does not accept it.
        await expect(
            demos.verifyMessage(TX_HASH, data, demos.getAddress(), {
                algorithm: "ed25519",
            }),
        ).resolves.toBe(false)
    })

    it("signs and verifies the bare bytes by default, as deployed verifiers expect", async () => {
        const demos = await connectedDemos()
        const message = "getL2PSHistory:subnet:0xabc:1700000000000"

        const { data } = await demos.signMessage(message, {
            algorithm: "ed25519",
        })
        const direct = await demos.crypto.sign(
            "ed25519",
            new TextEncoder().encode(message),
        )

        expect(data).toBe(uint8ArrayToHex(direct.signature))
        await expect(
            demos.verifyMessage(message, data, demos.getAddress(), {
                algorithm: "ed25519",
            }),
        ).resolves.toBe(true)
    })

    it("lets raw override personal", async () => {
        const demos = await connectedDemos()

        const { data } = await demos.signMessage(TX_HASH, {
            algorithm: "ed25519",
            personal: true,
            raw: true,
        })
        const direct = await demos.crypto.sign(
            "ed25519",
            new TextEncoder().encode(TX_HASH),
        )

        expect(data).toBe(uint8ArrayToHex(direct.signature))
    })

    it("refuses to sign a transaction's preimage unprefixed unless asked for raw", async () => {
        const demos = await connectedDemos()
        const domainForm = `demos-tx:v1:7:${TX_HASH}`

        for (const message of [TX_HASH, TX_HASH.toUpperCase(), domainForm]) {
            await expect(
                demos.signMessage(message, { algorithm: "ed25519" }),
            ).rejects.toThrow("transaction's signing preimage")
            await expect(
                demos.signMessage(Buffer.from(message), { algorithm: "ed25519" }),
            ).rejects.toThrow("transaction's signing preimage")
        }

        // Prefixed, it cannot stand in for the transaction, so it is fine.
        await expect(
            demos.signMessage(TX_HASH, { algorithm: "ed25519", personal: true }),
        ).resolves.toBeDefined()
        // A message that merely contains a transaction hash is not its preimage.
        await expect(
            demos.signMessage(`login:${TX_HASH}`, { algorithm: "ed25519" }),
        ).resolves.toBeDefined()
    })

    it("signs binary that is not valid UTF-8 by default, as 4.0.16 did", async () => {
        const demos = await connectedDemos()
        const bytes = Buffer.from([0x68, 0xff, 0x69])

        const { data } = await demos.signMessage(bytes, { algorithm: "ed25519" })

        await expect(
            demos.verifyMessage(bytes, data, demos.getAddress(), {
                algorithm: "ed25519",
            }),
        ).resolves.toBe(true)
    })

    it("keeps the raw path byte-identical for the node's auth headers", async () => {
        const demos = await connectedDemos()

        const { data } = await demos.signMessage(TX_HASH, {
            raw: true,
            algorithm: "ed25519",
        })
        const direct = await demos.crypto.sign(
            "ed25519",
            new TextEncoder().encode(TX_HASH),
        )

        expect(data).toBe(uint8ArrayToHex(direct.signature))
    })

    it("refuses binary messages that are not valid UTF-8, which the signers would rewrite", () => {
        expect(() => personalMessagePreimage(Uint8Array.from([0x68, 0xff, 0x69]))).toThrow("valid UTF-8")
        expect(() => personalMessagePreimage(Uint8Array.from([0x68, 0xfe, 0x69]))).toThrow("valid UTF-8")
        expect(personalMessagePreimage(new TextEncoder().encode("héllo")).length).toBeGreaterThan(0)
    })
})
