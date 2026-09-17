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

    it("round-trips through verifyMessage", async () => {
        const demos = await connectedDemos()

        const { data } = await demos.signMessage(TX_HASH, {
            algorithm: "ed25519",
        })

        await expect(
            demos.verifyMessage(TX_HASH, data, demos.getAddress(), {
                algorithm: "ed25519",
            }),
        ).resolves.toBe(true)
    })

    it("rejects a legacy raw signature by default", async () => {
        const demos = await connectedDemos()

        const { data } = await demos.signMessage(TX_HASH, {
            raw: true,
            algorithm: "ed25519",
        })

        await expect(
            demos.verifyMessage(TX_HASH, data, demos.getAddress(), {
                algorithm: "ed25519",
            }),
        ).resolves.toBe(false)
        await expect(
            demos.verifyMessage(TX_HASH, data, demos.getAddress(), {
                algorithm: "ed25519",
                raw: true,
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
})
