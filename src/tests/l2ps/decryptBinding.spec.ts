/**
 * L2PS decryptTx binds the decrypted inner transaction to its content: the hash is
 * recomputed from `content`, not just read from the transaction's own `.hash` field.
 */
import { describe, expect, it, jest } from "@jest/globals"
import forge from "node-forge"

import L2PS, { sha256Utf8 } from "@/l2ps/l2ps"
import { buildSettledL2PSTransfer } from "@/l2ps"
import { Demos } from "@/websdk"
import { Hashing } from "@/encryption/Hashing"
import { serializeTransactionContent } from "@/denomination/serializerGate"

const MNEMONIC = "test test test test test test test test test test test junk"
const TO = "0x" + "AB".repeat(32)
const UID = "binding_subnet"
const MISMATCH = /content does not match its hash/

async function newL2ps() {
    const l2ps = await L2PS.create()
    l2ps.setConfig({ uid: UID, config: { created_at_block: 0, known_rpcs: [] } })
    return l2ps
}

/** A signed inner transaction, by default in the post-fork (OS string) wire shape. */
async function signedInner(postFork = true) {
    const demos = new Demos()
    jest.spyOn(demos, "getNetworkInfo").mockResolvedValue({
        forks: { osDenomination: { activated: postFork }, signatureDomain: { activated: true } },
        chainId: 4242,
    } as never)
    jest.spyOn(demos, "getAddressNonce").mockResolvedValue(6)
    const internals = demos as unknown as { _getNetworkParametersCached: () => Promise<unknown> }
    jest.spyOn(internals, "_getNetworkParametersCached").mockResolvedValue({
        networkFee: 1,
        rpcFee: 1,
    })
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    if (!postFork) {
        // Settlement needs the fork, and a pre-fork amount must be whole DEM.
        return buildSettledL2PSTransfer(demos, { to: TO, amount: 5_000_000_000n, l2psUid: UID, settle: false })
    }
    return buildSettledL2PSTransfer(demos, { to: TO, amount: 5n, l2psUid: UID })
}

/** An inner transaction hashed in the pre-fork (DEM number) wire shape. */
function preForkInner() {
    const content = {
        type: "native",
        from: "0x" + "11".repeat(32),
        to: "0x" + "22".repeat(32),
        amount: 3,
        data: ["native", { nativeOperation: "send", args: [] }],
        gcr_edits: [
            {
                type: "balance",
                operation: "remove",
                isRollback: false,
                account: "0x" + "11".repeat(32),
                amount: 3 as number | string,
                txhash: "",
            },
        ],
        nonce: 1,
        timestamp: 1700000000000,
        transaction_fee: { network_fee: 1 as number | string, rpc_fee: 1, additional_fee: 0 },
    }
    return {
        content,
        signature: null,
        ed25519_signature: null,
        hash: Hashing.sha256(serializeTransactionContent(content as never, false)),
        status: "pending",
        blockNumber: null,
    }
}

/**
 * An inner transaction hashed the way the node's `Transaction.hash` does, with the
 * content left as built: raw JSON pre-fork, the post-fork serializer output after.
 */
function nodeHashedInner<T extends object>(content: T, postFork: boolean) {
    const hashed = postFork ? serializeTransactionContent(content as never, true) : JSON.stringify(content)
    return {
        content,
        signature: null,
        ed25519_signature: null,
        hash: sha256Utf8(hashed),
        status: "pending",
        blockNumber: null,
    }
}

/**
 * Encrypts the inner transaction's UTF-8 bytes under the subnet key, in the envelope
 * `encryptTx` builds for `carrier` (by default the inner transaction itself).
 */
async function encryptUtf8(l2ps: L2PS, tx: { hash: string }, carrier: object = tx) {
    const envelope = await l2ps.encryptTx(carrier as never)
    const sealed = await l2ps.encryptBytes(new TextEncoder().encode(JSON.stringify(tx)))
    Object.assign(envelope.content.data[1], {
        encrypted_data: sealed.ciphertext,
        tag: sealed.tag,
        nonce: sealed.nonce,
        original_hash: tx.hash,
    })
    return envelope
}

/** Content shaped like the node's L2PS messaging inner transaction: DEM-number zero amount and fees. */
function nodeMessagingContent() {
    return {
        type: "l2psInstantMessaging",
        from: "0x" + "11".repeat(32),
        to: "0x" + "22".repeat(32),
        amount: 0,
        data: ["l2psInstantMessaging", { messageId: "m1" }],
        gcr_edits: [],
        nonce: 1,
        timestamp: 1700000000000,
        transaction_fee: { network_fee: 0, rpc_fee: 0, additional_fee: 0, rpc_address: "" },
    }
}

/** Pre-fork content without `additional_fee`, which the SDK serializer cannot read. */
function noAdditionalFeeContent() {
    return { ...preForkInner().content, transaction_fee: { network_fee: 1, rpc_fee: 1 } }
}

describe("L2PS decryptTx content binding", () => {
    it("decrypts an untouched post-fork inner transaction", async () => {
        const l2ps = await newL2ps()
        const tx = await signedInner()
        const out = await l2ps.decryptTx(await l2ps.encryptTx(tx))
        expect(out.hash).toBe(tx.hash)
        expect(out.content).toEqual(tx.content)
    })

    it("refuses a tampered post-fork inner transaction whose .hash still matches", async () => {
        const l2ps = await newL2ps()
        const tx = await signedInner()
        const tampered = JSON.parse(JSON.stringify(tx))
        tampered.content.nonce += 1
        expect(tampered.hash).toBe(tx.hash)
        await expect(l2ps.decryptTx(await l2ps.encryptTx(tampered))).rejects.toThrow(MISMATCH)
    })

    it("decrypts an untouched pre-fork inner transaction signed by Demos.sign", async () => {
        const l2ps = await newL2ps()
        const tx = await signedInner(false)
        expect(tx.content.amount).toBe(5)
        const out = await l2ps.decryptTx(await l2ps.encryptTx(tx))
        expect(out.hash).toBe(tx.hash)
        expect(out.content).toEqual(tx.content)
    })

    it("decrypts an untouched pre-fork inner transaction", async () => {
        const l2ps = await newL2ps()
        const tx = preForkInner()
        const out = await l2ps.decryptTx(await l2ps.encryptTx(tx as never))
        expect(out.hash).toBe(tx.hash)
    })

    it("refuses a tampered pre-fork inner transaction whose .hash still matches", async () => {
        const l2ps = await newL2ps()
        const tx = preForkInner()
        tx.content.amount = 3000
        await expect(l2ps.decryptTx(await l2ps.encryptTx(tx as never))).rejects.toThrow(MISMATCH)
    })

    // The pre-fork serializer turns an OS string into a DEM number by integer
    // division, so these contents serialize to the bytes the original hashed.
    it.each([
        ["amount", (tx: ReturnType<typeof preForkInner>) => (tx.content.amount = "3000000001" as never)],
        ["fee", (tx: ReturnType<typeof preForkInner>) => (tx.content.transaction_fee.network_fee = "1999999999")],
        ["GCR balance", (tx: ReturnType<typeof preForkInner>) => (tx.content.gcr_edits[0].amount = "3000000001")],
    ])("refuses a pre-fork inner transaction whose %s serializes to the hashed bytes", async (_, tamper) => {
        const l2ps = await newL2ps()
        const tx = preForkInner()
        tamper(tx)
        expect(serializeTransactionContent(tx.content as never, false)).toBe(
            serializeTransactionContent(preForkInner().content as never, false),
        )
        await expect(l2ps.decryptTx(await l2ps.encryptTx(tx as never))).rejects.toThrow(MISMATCH)
    })

    // The post-fork serializer writes a DEM number as the same amount in OS, and
    // the node hashes post-fork content through it without reshaping the content.
    it("decrypts a post-fork inner transaction whose fee is the same amount as a DEM number", async () => {
        const l2ps = await newL2ps()
        const tx = await signedInner()
        expect(tx.content.transaction_fee.network_fee).toBe("1000000000")
        const dem = JSON.parse(JSON.stringify(tx))
        dem.content.transaction_fee.network_fee = 1
        expect(serializeTransactionContent(dem.content, true)).toBe(
            serializeTransactionContent(tx.content, true),
        )
        const out = await l2ps.decryptTx(await l2ps.encryptTx(dem))
        expect(out.content).toEqual(dem.content)
    })

    // Content the node's `Transaction.checkCoherence` accepts must decrypt, as built.
    it.each([
        ["node-built messaging transaction, post-fork", () => nodeHashedInner(nodeMessagingContent(), true)],
        ["node-built messaging transaction, pre-fork", () => nodeHashedInner(nodeMessagingContent(), false)],
        ["client transaction with DEM-number amounts, post-fork", () => nodeHashedInner(preForkInner().content, true)],
        ["pre-fork transaction without additional_fee", () => nodeHashedInner(noAdditionalFeeContent(), false)],
    ])("decrypts a %s", async (_, build) => {
        const l2ps = await newL2ps()
        const tx = build()
        const out = await l2ps.decryptTx(await l2ps.encryptTx(tx as never))
        expect(out.hash).toBe(tx.hash)
        expect(out.content).toEqual(tx.content)
    })

    // The node hashes the content's UTF-8 bytes.
    it.each([
        ["post-fork", true],
        ["pre-fork", false],
    ])("decrypts a %s inner transaction with non-ASCII text hashed as UTF-8", async (_, postFork) => {
        const l2ps = await newL2ps()
        const content = { ...nodeMessagingContent(), data: ["l2psInstantMessaging", { messageId: "café ✓" }] }
        const tx = nodeHashedInner(content, postFork)
        const out = await l2ps.decryptTx(await encryptUtf8(l2ps, tx))
        expect(out.hash).toBe(tx.hash)
        expect(out.content).toEqual(content)
    })

    // Hashed without UTF-8 encoding, this edit keeps the original's hash.
    it("refuses a tampered inner transaction with non-ASCII text whose .hash still matches", async () => {
        const l2ps = await newL2ps()
        const tx = nodeHashedInner(preForkInner().content, true)
        const tampered = JSON.parse(JSON.stringify(tx))
        tampered.content.type = "n`Ŵive"
        const unencoded = forge.md.sha256.create().update(serializeTransactionContent(tampered.content, true))
        expect(unencoded.digest().toHex()).toBe(tx.hash)
        await expect(l2ps.decryptTx(await encryptUtf8(l2ps, tampered))).rejects.toThrow(MISMATCH)
    })

    it("refuses a tampered inner transaction the serializer cannot read with the hash error", async () => {
        const l2ps = await newL2ps()
        const tx = nodeHashedInner(noAdditionalFeeContent(), false)
        tx.content.nonce += 1
        expect(() => serializeTransactionContent(tx.content as never, true)).toThrow()
        await expect(l2ps.decryptTx(await l2ps.encryptTx(tx as never))).rejects.toThrow(MISMATCH)
    })

    // `JSON.stringify(undefined)` gives no string, which forge would hash as "undefined".
    // The node's `checkCoherence` refuses such content at either fork state.
    it("refuses an inner transaction with no content whose hash is sha256 of \"undefined\"", async () => {
        const l2ps = await newL2ps()
        const tx = { hash: sha256Utf8("undefined"), signature: null }
        await expect(l2ps.decryptTx(await encryptUtf8(l2ps, tx, preForkInner()))).rejects.toThrow(MISMATCH)
    })

    // The node's pre-fork `checkCoherence` hashes `JSON.stringify(null)`, which is "null".
    it("decrypts a pre-fork inner transaction with null content", async () => {
        const l2ps = await newL2ps()
        const tx = { content: null, hash: sha256Utf8("null"), signature: null }
        const out = await l2ps.decryptTx(await encryptUtf8(l2ps, tx, preForkInner()))
        expect(out.hash).toBe(tx.hash)
        expect(out.content).toBeNull()
    })

    it("still refuses a payload whose original_hash differs from the inner .hash", async () => {
        const l2ps = await newL2ps()
        const encrypted = await l2ps.encryptTx(await signedInner())
        ;(encrypted.content.data[1] as { original_hash: string }).original_hash = "00".repeat(32)
        await expect(l2ps.decryptTx(encrypted)).rejects.toThrow(/hash mismatch/)
    })
})
