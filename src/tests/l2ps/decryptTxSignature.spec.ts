/**
 * `L2PS.decryptTx` returns the inner transaction only when its signature is
 * `content.from`'s signature over what `Demos.sign` signs.
 */
import { describe, expect, it, jest } from "@jest/globals"
import forge from "node-forge"

import { Cryptography } from "@/encryption/Cryptography"
import { UnifiedCrypto, uint8ArrayToHex } from "@/encryption/unifiedCrypto"
import { Demos } from "@/websdk"
import { txSignaturePreimage } from "@/websdk/utils/txSignaturePreimage"
import L2PS from "@/l2ps/l2ps"
import type { SigningAlgorithm, Transaction } from "@/types"

const MNEMONIC = "test test test test test test test test test test test junk"
const TO = "0x" + "ab".repeat(32)
const CHAIN_ID = 7

const PRE_FORK = { forks: { osDenomination: { activated: true } } }
const POST_FORK = {
    forks: {
        osDenomination: { activated: true },
        signatureDomain: { activated: true },
    },
    chainId: CHAIN_ID,
}

async function signedTx(
    algorithm: SigningAlgorithm,
    networkInfo: unknown = PRE_FORK,
): Promise<Transaction> {
    const demos = new Demos()
    jest.spyOn(demos, "getNetworkInfo").mockResolvedValue(networkInfo as never)
    await demos.connectWallet(MNEMONIC, { algorithm })
    return demos.pay(TO, 1_000_000_000n, { nonce: 1 })
}

async function roundTrip(inner: Transaction, chainId?: number) {
    const l2ps = await L2PS.create()
    return l2ps.decryptTx(await l2ps.encryptTx(inner), chainId === undefined ? undefined : { chainId })
}

describe("L2PS.decryptTx inner signature", () => {
    for (const algorithm of ["ed25519", "ml-dsa", "falcon"] as const) {
        it(`returns a valid ${algorithm} transaction`, async () => {
            const inner = await signedTx(algorithm)
            expect(inner.signature.type).toBe(algorithm)

            const decrypted = await roundTrip(inner)

            expect(decrypted.hash).toBe(inner.hash)
            expect(decrypted.signature).toEqual(inner.signature)
        })
    }

    it("returns a domain-bound transaction when given its chain id", async () => {
        const inner = await signedTx("ed25519", POST_FORK)

        expect((await roundTrip(inner, CHAIN_ID)).hash).toBe(inner.hash)
    })

    // Once the fork is active every new transaction is domain-bound, so that form goes first.
    it("checks the domain-bound form first when given a chain id", async () => {
        const inner = await signedTx("ed25519", POST_FORK)
        const verify = jest.spyOn(UnifiedCrypto.prototype, "verify")

        expect((await roundTrip(inner, CHAIN_ID)).hash).toBe(inner.hash)
        expect(verify).toHaveBeenCalledTimes(1)
        expect(verify.mock.calls[0][0].message).toEqual(txSignaturePreimage(inner.hash, CHAIN_ID, true))
        verify.mockRestore()
    })

    // Documented limit: which preimage a network requires is left to the node.
    it("returns a legacy bare-hash transaction even when given a chain id", async () => {
        const inner = await signedTx("ed25519")

        expect((await roundTrip(inner, CHAIN_ID)).hash).toBe(inner.hash)
    })

    it("refuses a domain-bound transaction for another chain", async () => {
        const inner = await signedTx("ed25519", POST_FORK)

        await expect(roundTrip(inner, CHAIN_ID + 1)).rejects.toThrow(
            "Decryption failed: Decrypted transaction signature does not verify",
        )
        await expect(roundTrip(inner)).rejects.toThrow(
            "Decryption failed: Decrypted transaction signature does not verify",
        )
    })

    it("refuses a tampered signature", async () => {
        const inner = await signedTx("ed25519")
        const last = inner.signature.data.slice(-2) === "00" ? "01" : "00"
        inner.signature.data = inner.signature.data.slice(0, -2) + last

        await expect(roundTrip(inner)).rejects.toThrow(
            "Decryption failed: Decrypted transaction signature does not verify",
        )
    })

    // Content is left as is: decryptTx checks the content against the hash first.
    it("refuses a signature by a key other than the one in content.from", async () => {
        const inner = await signedTx("ed25519")
        const other = forge.pki.ed25519.generateKeyPair()
        inner.signature = {
            type: "ed25519",
            data: uint8ArrayToHex(Cryptography.sign(inner.hash, other.privateKey)),
        }

        await expect(roundTrip(inner)).rejects.toThrow(
            "Decryption failed: Decrypted transaction signature does not verify",
        )
    })

    // Shape of the node's L2PS instant-messaging envelope (CHANGELOG, Breaking).
    it("refuses content signed by another key, as in node messaging envelopes", async () => {
        const inner = await signedTx("ed25519")
        const node = new Demos()
        await node.connectWallet("legal winner thank year wave sausage worth useful legal winner thank yellow", {
            algorithm: "ed25519",
        })
        inner.signature = await node.signMessage(JSON.stringify(inner.content), { raw: true })

        await expect(roundTrip(inner)).rejects.toThrow(
            "Decryption failed: Decrypted transaction signature does not verify",
        )
    })

    it("refuses an unsigned transaction", async () => {
        const inner = await signedTx("ed25519")
        inner.signature = null

        await expect(roundTrip(inner)).rejects.toThrow(
            "Decryption failed: Decrypted transaction is not signed",
        )
    })
})
