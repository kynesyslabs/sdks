/**
 * L2PS settlement v1, SDK side.
 *
 * `fixtures/settlementVectors.json` is a verbatim copy of the node's
 * `src/libs/l2ps/settlement/__fixtures__/settlementVectors.json` (node commit
 * 022f940f, Interface v1.1). Both repos test the same file, so a drift on either side fails
 * here or there; refresh the copy only when the node changes it.
 */
import { describe, expect, it, jest } from "@jest/globals"
import { ed25519 } from "@noble/curves/ed25519"

import vectors from "./fixtures/settlementVectors.json"
import { Demos } from "@/websdk"
import L2PS from "@/l2ps/l2ps"
import {
    buildSettledL2PSTransfer,
    l2psAccountLimbs,
    l2psFieldToHex,
    l2psHexToField,
    l2psSettlementCommitment,
    l2psSettlementMessage,
    l2psSettlementSalt,
    L2PS_SETTLEMENT_SALT_BYTES,
} from "@/l2ps"
import type { L2PSInnerSendPayload } from "@/types"
import { TX_SIGNATURE_DOMAIN } from "@/websdk/utils/txSignaturePreimage"

const hexBytes = (hex: string) => Uint8Array.from(Buffer.from(hex.slice(2), "hex"))

describe("settlement vectors (shared with the node)", () => {
    for (const [i, v] of vectors.transfers.entries()) {
        it(`transfer ${i}: commitment, message and signature`, () => {
            const c = l2psSettlementCommitment({
                from: v.from,
                to: v.to,
                amount: BigInt(v.amount),
                fee: BigInt(v.fee),
                nonce: BigInt(v.nonce),
                salt: BigInt(v.salt),
            })
            expect(l2psFieldToHex(c)).toBe(v.commitment)

            const message = l2psSettlementMessage(vectors.chainId, vectors.l2psUid, c)
            expect(new TextDecoder().decode(message)).toBe(v.message)

            const seed = hexBytes(v.seed)
            expect("0x" + Buffer.from(ed25519.getPublicKey(seed)).toString("hex")).toBe(v.from)
            // ed25519 is deterministic, so the signature itself is pinned.
            expect("0x" + Buffer.from(ed25519.sign(message, seed)).toString("hex")).toBe(
                v.signature,
            )
        })
    }

    it("matches an opening hashed independently with circomlibjs", () => {
        // Computed once with circomlibjs buildPoseidon (the circuit's reference
        // implementation), not with poseidon-lite.
        const c = l2psSettlementCommitment({
            from: "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c35a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a",
            to: "0x0017171717171717171717171717171717171717171717171717171717171717",
            amount: 123456789012345678901234567890n,
            fee: 2000000000n,
            nonce: 42n,
            salt: BigInt("0x" + "9e".repeat(31)),
        })
        expect(l2psFieldToHex(c)).toBe(
            "0x1c0657b2e25ebf740ce761704bb1660c23b56ff863d7b21e88f8f9c39923af6d",
        )
    })
})

describe("encoding rules", () => {
    const A = "0x" + "11".repeat(32)
    const base = { from: A, to: A, amount: 1n, fee: 1n, nonce: 1n, salt: 1n }

    it("splits an account into two big-endian 128-bit limbs", () => {
        const [hi, lo] = l2psAccountLimbs("0x" + "ff".repeat(16) + "00".repeat(15) + "01")
        expect(hi).toBe((1n << 128n) - 1n)
        expect(lo).toBe(1n)
        expect(() => l2psAccountLimbs("0x" + "AA".repeat(32))).toThrow()
        expect(() => l2psAccountLimbs("0x1234")).toThrow()
    })

    it("refuses out-of-range openings", () => {
        expect(() => l2psSettlementCommitment({ ...base, amount: 1n << 128n })).toThrow()
        expect(() => l2psSettlementCommitment({ ...base, fee: -1n })).toThrow()
        expect(() => l2psSettlementCommitment({ ...base, nonce: 1n << 64n })).toThrow()
        expect(() => l2psSettlementCommitment({ ...base, salt: 1n << 248n })).toThrow()
    })

    it("cannot be read as a transaction preimage or another subnet's message", () => {
        const text = new TextDecoder().decode(l2psSettlementMessage(1, "uid", 5n))
        expect(text.startsWith(TX_SIGNATURE_DOMAIN)).toBe(false)
        expect(() => l2psSettlementMessage(1, "a:b", 5n)).toThrow()
        expect(() => l2psSettlementMessage(1, "", 5n)).toThrow()
        expect(() => l2psSettlementMessage(-1, "uid", 5n)).toThrow()
    })

    it("draws a fresh 31-byte salt", () => {
        const a = l2psSettlementSalt()
        expect(a).toBeLessThan(1n << BigInt(8 * L2PS_SETTLEMENT_SALT_BYTES))
        expect(a).not.toBe(l2psSettlementSalt())
        expect(l2psHexToField(l2psFieldToHex(a))).toBe(a)
    })
})

const MNEMONIC = "test test test test test test test test test test test junk"
const TO = "0x" + "AB".repeat(32)
const UID = "settle_subnet"
const CHAIN_ID = 4242
const NETWORK_INFO = {
    forks: {
        osDenomination: { activated: true },
        signatureDomain: { activated: true },
    },
    chainId: CHAIN_ID,
}

/** A Demos whose only node contact is network info, fee parameters and nonce. */
async function connectedDemos(confirmedNonce = 6) {
    const demos = new Demos()
    jest.spyOn(demos, "getNetworkInfo").mockResolvedValue(NETWORK_INFO as never)
    jest.spyOn(demos, "getAddressNonce").mockResolvedValue(confirmedNonce)
    const internals = demos as unknown as { _getNetworkParametersCached: () => Promise<unknown> }
    jest.spyOn(internals, "_getNetworkParametersCached").mockResolvedValue({
        networkFee: 1,
        rpcFee: 1,
    })
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    return demos
}

const payloadOf = (tx: { content: { data: unknown } }) =>
    (tx.content.data as [string, L2PSInnerSendPayload])[1]

describe("buildSettledL2PSTransfer", () => {
    it("builds a signed native send whose settlement opens to its own fields", async () => {
        const demos = await connectedDemos()
        const tx = await buildSettledL2PSTransfer(demos, {
            to: TO,
            amount: 5_000_000_000n,
            l2psUid: UID,
        })

        const from = (await demos.getEd25519Address()).toLowerCase()
        const payload = payloadOf(tx)
        expect(tx.content.type).toBe("native")
        expect(tx.content.from).toBe(from)
        expect(tx.content.to).toBe(TO.toLowerCase())
        expect(tx.content.nonce).toBe(7)
        expect(payload.nativeOperation).toBe("send")
        expect(payload.args).toEqual([TO.toLowerCase(), "5000000000"])
        expect(payload.l2ps_uid).toBe(UID)

        // The fee is what sign() stamps for a native send on this node.
        const stamped = tx.content.transaction_fee
        const nativeFee =
            BigInt(stamped.network_fee) + BigInt(stamped.rpc_fee) + BigInt(stamped.additional_fee)
        expect(nativeFee).toBeGreaterThan(0n)

        const s = payload.settlement!
        expect(Object.keys(s).sort()).toEqual(["commitment", "fee", "salt", "signature"])
        expect(s.fee).toBe(nativeFee.toString())
        expect(s.salt).toMatch(/^0x00[0-9a-f]{62}$/)
        expect(s.commitment).toMatch(/^0x[0-9a-f]{64}$/)
        expect(s.signature).toMatch(/^0x[0-9a-f]{128}$/)

        // What a member does after decrypting: recompute c from the transfer.
        const c = l2psSettlementCommitment({
            from: tx.content.from as string,
            to: payload.args[0],
            amount: BigInt(payload.args[1]),
            fee: BigInt(s.fee),
            nonce: BigInt(tx.content.nonce),
            salt: l2psHexToField(s.salt),
        })
        expect(l2psFieldToHex(c)).toBe(s.commitment)

        // What any validator does: check the signature against the public signer.
        const message = l2psSettlementMessage(CHAIN_ID, UID, c)
        expect(ed25519.verify(hexBytes(s.signature), message, hexBytes(from))).toBe(true)

        // The transaction signature still covers the content, settlement included.
        expect(
            ed25519.verify(
                hexBytes(tx.signature.data),
                new TextEncoder().encode(`${TX_SIGNATURE_DOMAIN}${CHAIN_ID}:${tx.hash}`),
                hexBytes(from),
            ),
        ).toBe(true)
    })

    it("survives encryptTx and decryptTx unchanged", async () => {
        const demos = await connectedDemos()
        const tx = await buildSettledL2PSTransfer(demos, {
            to: TO,
            amount: 1n,
            l2psUid: UID,
        })
        const l2ps = await L2PS.create()
        l2ps.setConfig({ uid: UID, config: { created_at_block: 0, known_rpcs: [] } })
        const encrypted = await l2ps.encryptTx(tx)
        expect(encrypted.content.nonce).toBe(tx.content.nonce)
        const decrypted = await l2ps.decryptTx(encrypted)
        expect(payloadOf(decrypted).settlement).toEqual(payloadOf(tx).settlement)
    })

    it("keeps the receiver and the amount out of the public outer transaction", async () => {
        const demos = await connectedDemos()
        const l2ps = await L2PS.create()
        l2ps.setConfig({ uid: UID, config: { created_at_block: 0, known_rpcs: [] } })
        const amount = 987_654_321_123n
        const inner = await buildSettledL2PSTransfer(demos, { to: TO, amount, l2psUid: UID })
        const outer = await l2ps.encryptTx(inner)

        const json = JSON.stringify(outer).toLowerCase()
        expect(json).not.toContain(TO.slice(2).toLowerCase())
        expect(json).not.toContain(amount.toString())
        expect(outer.content.to).toBe(inner.content.from)
        expect(outer.content.amount).toBe(0)

        // Ciphertext length must not track the amount's digit count.
        const small = await l2ps.encryptTx(
            await buildSettledL2PSTransfer(demos, { to: TO, amount: 1n, l2psUid: UID }),
        )
        expect(small.content.data[1].encrypted_data.length).toBe(
            outer.content.data[1].encrypted_data.length,
        )
        expect(payloadOf(await l2ps.decryptTx(outer)).args[1]).toBe(amount.toString())
    })

    it("uses a given nonce, fee and chain id", async () => {
        const demos = await connectedDemos()
        const tx = await buildSettledL2PSTransfer(demos, {
            to: TO,
            amount: 10n,
            l2psUid: UID,
            nonce: 31,
            fee: 9_000_000_000n,
            chainId: 77,
        })
        const s = payloadOf(tx).settlement!
        expect(tx.content.nonce).toBe(31)
        expect(s.fee).toBe("9000000000")
        const c = l2psHexToField(s.commitment)
        expect(
            ed25519.verify(
                hexBytes(s.signature),
                l2psSettlementMessage(77, UID, c),
                hexBytes(tx.content.from as string),
            ),
        ).toBe(true)
        expect(demos.getAddressNonce).not.toHaveBeenCalled()
    })

    it("refuses a given fee below the node's native transfer fee", async () => {
        const demos = await connectedDemos()
        const probe = await buildSettledL2PSTransfer(demos, { to: TO, amount: 1n, l2psUid: UID })
        const nativeFee = BigInt(payloadOf(probe).settlement!.fee)
        expect(nativeFee).toBeGreaterThan(0n)

        for (const fee of [0n, nativeFee - 1n]) {
            await expect(
                buildSettledL2PSTransfer(demos, { to: TO, amount: 1n, l2psUid: UID, fee }),
            ).rejects.toThrow(/below the native transfer fee/)
        }
        const atFloor = await buildSettledL2PSTransfer(demos, {
            to: TO,
            amount: 1n,
            l2psUid: UID,
            fee: nativeFee,
        })
        expect(payloadOf(atFloor).settlement!.fee).toBe(nativeFee.toString())
    })

    it("still builds the pre-settlement transfer with settle: false", async () => {
        const demos = await connectedDemos()
        const tx = await buildSettledL2PSTransfer(demos, {
            to: TO,
            amount: 2_000_000_000n,
            l2psUid: UID,
            settle: false,
        })
        expect(payloadOf(tx)).toEqual({
            nativeOperation: "send",
            args: [TO.toLowerCase(), "2000000000"],
            l2ps_uid: UID,
        })
        expect(tx.content.nonce).toBe(7)
    })

    it("refuses to settle without a chain id or before the OS denomination", async () => {
        const noChain = await connectedDemos()
        jest.spyOn(noChain, "getNetworkInfo").mockResolvedValue({
            forks: { osDenomination: { activated: true } },
        } as never)
        await expect(
            buildSettledL2PSTransfer(noChain, { to: TO, amount: 1n, l2psUid: UID }),
        ).rejects.toThrow(/chain id/)

        const preFork = await connectedDemos()
        jest.spyOn(preFork, "getNetworkInfo").mockResolvedValue({
            forks: { osDenomination: { activated: false } },
            chainId: CHAIN_ID,
        } as never)
        await expect(
            buildSettledL2PSTransfer(preFork, { to: TO, amount: 1n, l2psUid: UID }),
        ).rejects.toThrow(/osDenomination/)
    })
})
