import { describe, test, expect } from "@jest/globals"
import * as forge from "node-forge"
import L2PS, { L2PS_PLAINTEXT_BUCKET } from "@/l2ps/l2ps"
import type { Transaction } from "@/types/blockchain/Transaction"
import { Hashing } from "@/encryption/Hashing"
import { Cryptography } from "@/encryption/Cryptography"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"

// `L2PS.decryptTx` decodes the plaintext as UTF-8, so `L2PS.encryptTx`
// must encode it as UTF-8. ASCII-only transactions keep the exact
// plaintext bytes older SDKs produced.

// decryptTx only returns transactions signed by the key in `content.from`.
const sender = forge.pki.ed25519.generateKeyPair()
const SENDER = uint8ArrayToHex(sender.publicKey)

// decryptTx recomputes the hash from the decrypted content, so the
// fixture carries the real UTF-8 content hash.
function makeTx(memo: string): Transaction {
    const tx = {
        content: {
            type: "native",
            from: SENDER,
            to: "0x" + "b".repeat(64),
            from_ed25519_address: SENDER,
            amount: "100",
            data: [
                "native",
                {
                    nativeOperation: "send",
                    args: ["0x" + "b".repeat(64), "100"],
                    memo,
                },
            ],
            gcr_edits: [],
            nonce: 1,
            timestamp: 1_700_000_000_000,
            transaction_fee: {
                network_fee: "0",
                rpc_fee: "0",
                additional_fee: "0",
                rpc_address: null,
            },
        },
        hash: "",
        signature: null,
        ed25519_signature: null,
        status: null,
        blockNumber: null,
    } as unknown as Transaction
    tx.hash = Hashing.sha256(JSON.stringify(tx.content))
    tx.signature = {
        type: "ed25519",
        data: uint8ArrayToHex(Cryptography.sign(tx.hash, sender.privateKey)),
    }
    return tx
}

// Raw plaintext bytes (as a binary string) of an encryptTx payload.
function plaintextBytes(key: string, enc: any): string {
    const payload = enc.content.data[1]
    const iv = forge.util.decode64(payload.nonce)
    const decipher = forge.cipher.createDecipher("AES-GCM", key)
    decipher.start({
        iv,
        tag: forge.util.createBuffer(forge.util.decode64(payload.tag)),
        additionalData: iv,
    })
    decipher.update(
        forge.util.createBuffer(forge.util.decode64(payload.encrypted_data)),
    )
    if (!decipher.finish()) throw new Error("test setup: decrypt failed")
    return decipher.output.getBytes()
}

describe("L2PS encryptTx UTF-8 plaintext", () => {
    test.each([
        ["Latin-1", "café"],
        ["BMP", "€ 日本"],
        ["astral", "🙂 𝄞"],
    ])("round-trips a memo with %s characters", async (_label, memo) => {
        const l2ps = await L2PS.create()
        const tx = makeTx(memo)
        const dec = await l2ps.decryptTx(await l2ps.encryptTx(tx))
        expect(dec).toEqual(tx)
        expect((dec.content.data[1] as any).memo).toBe(memo)
    })

    test("ASCII-only transactions keep the previous plaintext bytes", async () => {
        const key = forge.random.getBytesSync(32)
        const l2ps = await L2PS.create(key)
        const tx = makeTx("plain ascii memo")
        const enc = await l2ps.encryptTx(tx)

        const json = JSON.stringify(tx)
        const previous = json.padEnd(L2PS_PLAINTEXT_BUCKET, " ")
        expect(json.length).toBeLessThan(L2PS_PLAINTEXT_BUCKET)
        expect(plaintextBytes(key, enc)).toBe(previous)
    })

    test("pads the UTF-8 plaintext to a whole bucket", async () => {
        const key = forge.random.getBytesSync(32)
        const l2ps = await L2PS.create(key)
        const tx = makeTx("café 🙂 𝄞")
        const bytes = plaintextBytes(key, await l2ps.encryptTx(tx))

        const utf8 = new TextEncoder().encode(JSON.stringify(tx))
        expect(bytes.length % L2PS_PLAINTEXT_BUCKET).toBe(0)
        expect(bytes.length).toBeGreaterThan(utf8.length)
        expect(Array.from(bytes.slice(0, utf8.length), c => c.charCodeAt(0))).toEqual(
            Array.from(utf8),
        )
        expect(bytes.slice(utf8.length).trim()).toBe("")
    })
})
