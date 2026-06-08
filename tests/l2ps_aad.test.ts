import { describe, test, expect } from "@jest/globals"
import * as forge from "node-forge"
import L2PS from "@/l2ps/l2ps"
import type { Transaction } from "@/types/blockchain/Transaction"

// AES-GCM AAD binding + per-call nonce validation contract for
// `L2PS.encryptTx` / `L2PS.decryptTx`. Each test covers one rejection
// path that would otherwise let a malformed or tampered payload either
// silently fall through to the legacy IV or pass authentication when
// it should not.

function makeTx(): Transaction {
    return {
        content: {
            type: "native",
            from: "0x" + "a".repeat(64),
            to: "0x" + "b".repeat(64),
            from_ed25519_address: "0x" + "a".repeat(64),
            amount: "100",
            data: [
                "native",
                { nativeOperation: "send", args: ["0x" + "b".repeat(64), "100"] },
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
        hash: "deadbeef".repeat(8),
        signature: null,
        ed25519_signature: null,
        status: null,
        blockNumber: null,
    } as unknown as Transaction
}

describe("L2PS AES-GCM AAD binding + nonce validation", () => {
    test("encryptTx → decryptTx round-trips with AAD-bound per-call nonce", async () => {
        const l2ps = await L2PS.create()
        const tx = makeTx()
        const enc = await l2ps.encryptTx(tx)
        const dec = await l2ps.decryptTx(enc)
        expect(dec.hash).toBe(tx.hash)
    })

    test("tampering with the wire nonce field fails authentication", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptTx(makeTx())

        // Flip the nonce on the wire. AAD binding makes the auth tag
        // depend on the nonce, so a mismatched IV/AAD pair must fail
        // tag verification instead of silently producing garbage.
        const tampered = JSON.parse(JSON.stringify(enc))
        const payload = tampered.content.data[1]
        const freshNonce = forge.util.encode64(forge.random.getBytesSync(12))
        expect(freshNonce).not.toBe(payload.nonce)
        payload.nonce = freshNonce

        await expect(l2ps.decryptTx(tampered)).rejects.toThrow(/Decryption failed/)
    })

    test("empty-string nonce is rejected (not silently treated as legacy)", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptTx(makeTx())

        const malformed = JSON.parse(JSON.stringify(enc))
        malformed.content.data[1].nonce = ""

        await expect(l2ps.decryptTx(malformed)).rejects.toThrow(
            /Invalid encrypted payload nonce/,
        )
    })

    test("non-12-byte nonce is rejected", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptTx(makeTx())

        const shortIv = JSON.parse(JSON.stringify(enc))
        shortIv.content.data[1].nonce = forge.util.encode64(
            forge.random.getBytesSync(5),
        )

        await expect(l2ps.decryptTx(shortIv)).rejects.toThrow(
            /Invalid encrypted payload nonce/,
        )
    })

    test("missing nonce (legacy payload) still decrypts via the instance IV", async () => {
        // Simulate a payload encrypted by a pre-fix SDK: no `nonce`
        // field, content encrypted with the instance IV and no AAD.
        const sharedKey = forge.random.getBytesSync(32)
        const sharedIv = forge.random.getBytesSync(12)

        const cipher = forge.cipher.createCipher("AES-GCM", sharedKey)
        cipher.start({ iv: sharedIv })
        const tx = makeTx()
        cipher.update(forge.util.createBuffer(JSON.stringify(tx)))
        if (!cipher.finish()) throw new Error("test setup: encrypt failed")

        const legacyEnc = {
            content: {
                type: "l2psEncryptedTx",
                from: tx.content.from,
                to: tx.content.to,
                from_ed25519_address: tx.content.from_ed25519_address,
                amount: 0,
                data: [
                    "l2psEncryptedTx",
                    {
                        l2ps_uid: "legacy-uid",
                        encrypted_data: forge.util.encode64(
                            cipher.output.getBytes(),
                        ),
                        tag: forge.util.encode64(cipher.mode.tag.getBytes()),
                        original_hash: tx.hash,
                        // no `nonce` field — this is the legacy shape
                    },
                ],
                gcr_edits: [],
                nonce: tx.content.nonce,
                timestamp: Date.now(),
                transaction_fee: tx.content.transaction_fee,
            },
            ed25519_signature: tx.ed25519_signature,
            signature: null,
            hash: "ignored-in-this-test",
            status: "pending",
            blockNumber: null,
        } as any

        const l2ps = await L2PS.create(sharedKey, sharedIv)
        // Override the auto-generated uid so the payload's l2ps_uid check passes.
        ;(l2ps as any).id = "legacy-uid"
        ;(l2ps as any).config = { uid: "legacy-uid" }

        const dec = await l2ps.decryptTx(legacyEnc)
        expect(dec.hash).toBe(tx.hash)
    })
})
