import { Demos, DemosWebAuth } from "@/websdk"
import {
    demosClaimRefForAddress,
    type ClaimReference,
} from "@/identity/cci"
import L2PS from "@/l2ps/l2ps"
import { L2PSEncryptedBytes } from "@/l2ps/l2ps"
import {
    anchorProgramName,
    type AnchoredTranscriptPayload,
} from "@/l2ps/anchor"
import {
    ChannelSession,
    exportTranscript,
    type ChannelMessage,
    type ChannelTranscript,
} from "@/l2ps/channel"

const CHANNEL = "ch-7f9a"

async function newConnectedDemos(): Promise<{
    demos: Demos
    claim: ClaimReference
}> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return {
        demos,
        claim: demosClaimRefForAddress(await demos.getEd25519Address()),
    }
}

async function buildTranscript(
    alice: { demos: Demos; claim: ClaimReference },
    bob: { demos: Demos; claim: ClaimReference },
): Promise<ChannelTranscript> {
    const a = new ChannelSession({
        channelId: CHANNEL,
        members: [alice.claim, bob.claim],
        me: alice.claim,
        demos: alice.demos,
    })
    const b = new ChannelSession({
        channelId: CHANNEL,
        members: [alice.claim, bob.claim],
        me: bob.claim,
        demos: bob.demos,
    })
    await a.open()
    await b.open()
    const m1 = await a.sendOutgoing({ type: "offer", body: { price: 100 } })
    await b.receiveIncoming(m1)
    const m2 = await b.sendOutgoing({
        type: "accept",
        body: {},
        repliesTo: 1,
    })
    await a.receiveIncoming(m2)
    return exportTranscript({
        channelId: CHANNEL,
        members: [alice.claim, bob.claim],
        messages: [m1, m2],
        signers: [{ claim: alice.claim, demos: alice.demos }],
    })
}

describe("anchorProgramName", () => {
    it("is deterministic per channelId", () => {
        expect(anchorProgramName("ch-A")).toBe("l2ps-transcript:ch-A")
    })
})

describe("L2PS.encryptBytes / decryptBytes (WI-3 building block)", () => {
    it("round-trips raw bytes", async () => {
        const l2ps = await L2PS.create()
        const plain = new TextEncoder().encode("hello transcript")
        const enc = await l2ps.encryptBytes(plain)
        expect(enc.l2ps_uid).toBe(l2ps.getId())
        expect(enc.nonce.length).toBeGreaterThan(0)
        const back = await l2ps.decryptBytes(enc)
        expect(new TextDecoder().decode(back)).toBe("hello transcript")
    })

    it("uses a fresh nonce per encryption", async () => {
        const l2ps = await L2PS.create()
        const plain = new TextEncoder().encode("same plaintext")
        const a = await l2ps.encryptBytes(plain)
        const b = await l2ps.encryptBytes(plain)
        expect(a.nonce).not.toBe(b.nonce)
        expect(a.ciphertext).not.toBe(b.ciphertext)
    })

    it("rejects payload encrypted for a different L2PS uid", async () => {
        const a = await L2PS.create()
        const b = await L2PS.create()
        const enc = await a.encryptBytes(new TextEncoder().encode("x"))
        await expect(b.decryptBytes(enc)).rejects.toThrow(/different L2PS/)
    })

    it("rejects tampered ciphertext (AES-GCM auth)", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptBytes(
            new TextEncoder().encode("secret"),
        )
        // Flip a single base64 character in the ciphertext
        const tampered: L2PSEncryptedBytes = {
            ...enc,
            ciphertext:
                (enc.ciphertext[0] === "A" ? "B" : "A") +
                enc.ciphertext.slice(1),
        }
        await expect(l2ps.decryptBytes(tampered)).rejects.toThrow(
            /authentication/,
        )
    })

    it("rejects malformed nonce length", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptBytes(new TextEncoder().encode("x"))
        const bad: L2PSEncryptedBytes = {
            ...enc,
            nonce: Buffer.from(new Uint8Array(8)).toString("base64"),
        }
        await expect(l2ps.decryptBytes(bad)).rejects.toThrow(/12-byte/)
    })

    // Regression for CodeRabbit finding on l2ps.ts:466. Storage-loaded
    // JSON can violate the L2PSEncryptedBytes shape; without the explicit
    // shape guard forge throws an opaque base64 error.
    it("rejects payload with missing ciphertext / tag / nonce fields", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptBytes(new TextEncoder().encode("x"))
        for (const field of ["ciphertext", "tag", "nonce"] as const) {
            const bad = { ...enc, [field]: undefined } as unknown as L2PSEncryptedBytes
            await expect(l2ps.decryptBytes(bad)).rejects.toThrow(
                /base64 strings for ciphertext, tag, and nonce/,
            )
        }
    })

    it("rejects payload with non-string field types", async () => {
        const l2ps = await L2PS.create()
        const enc = await l2ps.encryptBytes(new TextEncoder().encode("x"))
        const bad = { ...enc, ciphertext: 12345 } as unknown as L2PSEncryptedBytes
        await expect(l2ps.decryptBytes(bad)).rejects.toThrow(
            /base64 strings for ciphertext, tag, and nonce/,
        )
    })
})

describe("anchorEncryptedTranscript — policy gating (WI-3)", () => {
    let alice: { demos: Demos; claim: ClaimReference }
    let bob: { demos: Demos; claim: ClaimReference }

    beforeEach(async () => {
        alice = await newConnectedDemos()
        bob = await newConnectedDemos()
    })

    it("policy 'none' throws", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await expect(
            anchorEncryptedTranscript({
                transcript,
                l2ps,
                demos: alice.demos,
                signer: alice.claim,
                policy: "none",
            }),
        ).rejects.toThrow(/'none'/)
    })

    it("policy 'recommended' without consent returns null and does NOT broadcast", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const broadcastSpy = jest.spyOn(alice.demos as any, "broadcast")
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        const result = await anchorEncryptedTranscript({
            transcript,
            l2ps,
            demos: alice.demos,
            signer: alice.claim,
            policy: "encrypted-anchored-recommended",
        })
        expect(result).toBeNull()
        expect(broadcastSpy).not.toHaveBeenCalled()
    })

    it("policy 'recommended' WITH consent attempts to anchor (reaches broadcast)", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const broadcastSpy = jest
            .spyOn(alice.demos as any, "broadcast")
            .mockResolvedValueOnce({ ok: true })
        const confirmSpy = jest
            .spyOn(alice.demos as any, "confirm")
            .mockResolvedValueOnce({ ok: true })
        jest.spyOn(alice.demos as any, "getAddressNonce").mockResolvedValue(0)

        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        const result = await anchorEncryptedTranscript({
            transcript,
            l2ps,
            demos: alice.demos,
            signer: alice.claim,
            policy: "encrypted-anchored-recommended",
            consent: true,
        })
        expect(result).not.toBeNull()
        expect(result!.anchor).toMatch(/^stor-/)
        expect(result!.contentHash.length).toBe(64)
        expect(broadcastSpy).toHaveBeenCalledTimes(1)
        expect(confirmSpy).toHaveBeenCalledTimes(1)
    })

    it("policy 'required' propagates broadcast failure (phase fails)", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        jest.spyOn(alice.demos as any, "getAddressNonce").mockResolvedValue(0)
        jest.spyOn(alice.demos as any, "confirm").mockResolvedValue({ ok: true })
        jest
            .spyOn(alice.demos as any, "broadcast")
            .mockRejectedValueOnce(new Error("rpc down"))

        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await expect(
            anchorEncryptedTranscript({
                transcript,
                l2ps,
                demos: alice.demos,
                signer: alice.claim,
                policy: "encrypted-anchored-required",
            }),
        ).rejects.toThrow(/rpc down/)
    })

    it("refuses signer not in transcript.members", async () => {
        const transcript = await buildTranscript(alice, bob)
        const eve = await newConnectedDemos()
        const l2ps = await L2PS.create()
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await expect(
            anchorEncryptedTranscript({
                transcript,
                l2ps,
                demos: eve.demos,
                signer: eve.claim,
                policy: "encrypted-anchored-required",
            }),
        ).rejects.toThrow(/not in transcript.members/)
    })

    it("refuses non-demos signer", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await expect(
            anchorEncryptedTranscript({
                transcript,
                l2ps,
                demos: alice.demos,
                signer: "eip155:0xabc" as ClaimReference,
                policy: "encrypted-anchored-required",
            }),
        ).rejects.toThrow(/demos:/)
    })

    it("refuses signer that does not match connected wallet", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await expect(
            anchorEncryptedTranscript({
                transcript,
                l2ps,
                demos: alice.demos,
                signer: bob.claim,
                policy: "encrypted-anchored-required",
            }),
        ).rejects.toThrow(/does not match/)
    })
})

describe("decrypt + tamper-evidence (WI-3 acceptance)", () => {
    let alice: { demos: Demos; claim: ClaimReference }
    let bob: { demos: Demos; claim: ClaimReference }

    beforeEach(async () => {
        alice = await newConnectedDemos()
        bob = await newConnectedDemos()
    })

    /**
     * In-memory simulation of the chain: capture the SP payload we'd
     * broadcast, then run decrypt/verify against that captured payload
     * without touching the network. This is the closest we can get to an
     * end-to-end round-trip without a live chain.
     */
    async function captureAnchorPayload(
        transcript: ChannelTranscript,
        l2ps: L2PS,
        signer: { demos: Demos; claim: ClaimReference },
    ): Promise<{
        payload: AnchoredTranscriptPayload
        storageAddress: string
    }> {
        let captured: AnchoredTranscriptPayload | null = null
        let address = ""
        jest.spyOn(signer.demos as any, "getAddressNonce").mockResolvedValue(0)
        jest.spyOn(signer.demos as any, "confirm").mockImplementation(
            async (tx: any) => {
                const inner = tx.content.data[1]
                captured = inner.data as AnchoredTranscriptPayload
                address = inner.storageAddress
                return { ok: true }
            },
        )
        jest.spyOn(signer.demos as any, "broadcast").mockResolvedValue({
            ok: true,
        })
        const { anchorEncryptedTranscript } = await import("@/l2ps/anchor")
        await anchorEncryptedTranscript({
            transcript,
            l2ps,
            demos: signer.demos,
            signer: signer.claim,
            policy: "encrypted-anchored-required",
        })
        if (!captured) throw new Error("payload not captured")
        return { payload: captured, storageAddress: address }
    }

    it("hash-verifies the on-chain ciphertext (anyone can check)", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { payload } = await captureAnchorPayload(transcript, l2ps, alice)
        const { sha256 } = await import("@noble/hashes/sha2")
        const rederived = Buffer.from(
            sha256(Buffer.from(payload.encrypted.ciphertext, "base64")),
        ).toString("hex")
        expect(rederived).toBe(payload.contentHash)
    })

    it("any tampering of the ciphertext flips the content-hash", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { payload } = await captureAnchorPayload(transcript, l2ps, alice)
        const tampered: AnchoredTranscriptPayload = {
            ...payload,
            encrypted: {
                ...payload.encrypted,
                ciphertext:
                    (payload.encrypted.ciphertext[0] === "A" ? "B" : "A") +
                    payload.encrypted.ciphertext.slice(1),
            },
        }
        const { sha256 } = await import("@noble/hashes/sha2")
        const rederived = Buffer.from(
            sha256(Buffer.from(tampered.encrypted.ciphertext, "base64")),
        ).toString("hex")
        expect(rederived).not.toBe(payload.contentHash)
    })

    it("non-member L2PS instance cannot decrypt", async () => {
        const transcript = await buildTranscript(alice, bob)
        const memberL2ps = await L2PS.create()
        const { payload } = await captureAnchorPayload(
            transcript,
            memberL2ps,
            alice,
        )
        const nonMemberL2ps = await L2PS.create()
        await expect(
            nonMemberL2ps.decryptBytes(payload.encrypted),
        ).rejects.toThrow(/different L2PS/)
    })

    it("member L2PS instance decrypts back to the original transcript", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { payload } = await captureAnchorPayload(transcript, l2ps, alice)
        const plain = await l2ps.decryptBytes(payload.encrypted)
        const decoded = JSON.parse(new TextDecoder().decode(plain))
        expect(decoded.channelId).toBe(transcript.channelId)
        expect(decoded.members).toEqual(transcript.members)
        expect(decoded.messages.length).toBe(transcript.messages.length)
        expect(decoded.messages[0].signature.signature).toBe(
            transcript.messages[0].signature.signature,
        )
    })

    it("embedded plaintext-signature re-verifies under the signer's claim", async () => {
        const transcript = await buildTranscript(alice, bob)
        const l2ps = await L2PS.create()
        const { payload } = await captureAnchorPayload(transcript, l2ps, alice)
        const { transcriptSigningBytes } = await import("@/l2ps/channel")
        const { verifyPrimaryClaimSignature } = await import("@/identity/cci")
        const plain = await l2ps.decryptBytes(payload.encrypted)
        const transcriptUnsigned = JSON.parse(
            new TextDecoder().decode(plain),
        )
        const sig = Buffer.from(
            payload.signature.signature.slice(2),
            "hex",
        )
        expect(
            verifyPrimaryClaimSignature(
                payload.signature.signer,
                transcriptSigningBytes(transcriptUnsigned),
                sig,
            ),
        ).toBe(true)
    })
})

describe("Sanity: transcript fixture used in anchor tests is well-formed", () => {
    it("has messages in sequence and members with the signer", async () => {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const t = await buildTranscript(alice, bob)
        expect(t.messages.map((m: ChannelMessage) => m.sequence)).toEqual([1, 2])
        expect(t.members).toContain(alice.claim)
        expect(t.members).toContain(bob.claim)
    })
})
