import { Demos, DemosWebAuth } from "@/websdk"
import {
    demosClaimRefForAddress,
    type ClaimReference,
} from "@/identity/cci"
import {
    ChannelSession,
    CHANNEL_MESSAGE_DOMAIN_PREFIX,
    channelMessageSigningBytes,
    envelopeHashHex,
    exportTranscript,
    InMemoryChannelIdRegistry,
    signChannelMessage,
    signTranscript,
    stripChannelMessageSignature,
    transcriptSigningBytes,
    TRANSCRIPT_DOMAIN_PREFIX,
    verifyChannelMessage,
    verifyTranscript,
    type ChannelMessage,
    type UnsignedChannelMessage,
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

function unsignedFixture(
    sender: ClaimReference,
    overrides: Partial<UnsignedChannelMessage> = {},
): UnsignedChannelMessage {
    return {
        channelId: CHANNEL,
        sequence: 1,
        sender,
        sentAt: 1700000000000,
        type: "offer",
        body: { price: 100 },
        ...overrides,
    }
}

describe("Channel canonical bytes (WI-2)", () => {
    it("envelope signing bytes start with dacs-channelmsg:v1: + 64-hex digest", async () => {
        const { claim } = await newConnectedDemos()
        const bytes = channelMessageSigningBytes(unsignedFixture(claim))
        const str = new TextDecoder().decode(bytes)
        expect(str.startsWith(CHANNEL_MESSAGE_DOMAIN_PREFIX)).toBe(true)
        expect(str.length).toBe(CHANNEL_MESSAGE_DOMAIN_PREFIX.length + 64)
    })

    it("envelopeHashHex is stable across invocations", async () => {
        const { claim } = await newConnectedDemos()
        const fx = unsignedFixture(claim)
        expect(envelopeHashHex(fx)).toBe(envelopeHashHex(fx))
    })

    it("envelopeHashHex differs when any field differs", async () => {
        const { claim } = await newConnectedDemos()
        const a = envelopeHashHex(unsignedFixture(claim, { sequence: 1 }))
        const b = envelopeHashHex(unsignedFixture(claim, { sequence: 2 }))
        expect(a).not.toBe(b)
    })

    it("transcript signing bytes use dacs-transcript:v1:", async () => {
        const { claim } = await newConnectedDemos()
        const bytes = transcriptSigningBytes({
            transcriptVersion: "1",
            channelId: CHANNEL,
            members: [claim],
            messages: [],
            generatedAt: 1700000000000,
        })
        expect(
            new TextDecoder().decode(bytes).startsWith(TRANSCRIPT_DOMAIN_PREFIX),
        ).toBe(true)
    })
})

describe("signChannelMessage / verifyChannelMessage (WI-2)", () => {
    it("round-trips: sign → verify true", async () => {
        const { demos, claim } = await newConnectedDemos()
        const signed = await signChannelMessage(unsignedFixture(claim), demos)
        expect(signed.signature.sigVersion).toBe("1")
        expect(signed.signature.signature.startsWith("0x")).toBe(true)
        expect(verifyChannelMessage(signed)).toBe(true)
    })

    it("rejects tampered body", async () => {
        const { demos, claim } = await newConnectedDemos()
        const signed = await signChannelMessage(unsignedFixture(claim), demos)
        const tampered: ChannelMessage = { ...signed, body: { price: 999 } }
        expect(verifyChannelMessage(tampered)).toBe(false)
    })

    it("rejects tampered sequence", async () => {
        const { demos, claim } = await newConnectedDemos()
        const signed = await signChannelMessage(unsignedFixture(claim), demos)
        expect(verifyChannelMessage({ ...signed, sequence: 999 })).toBe(false)
    })

    it("rejects swapped sender claim", async () => {
        const { demos, claim } = await newConnectedDemos()
        const other = await newConnectedDemos()
        const signed = await signChannelMessage(unsignedFixture(claim), demos)
        expect(verifyChannelMessage({ ...signed, sender: other.claim })).toBe(
            false,
        )
    })

    it("refuses to sign when sender does not match connected wallet", async () => {
        const { demos } = await newConnectedDemos()
        const other = await newConnectedDemos()
        await expect(
            signChannelMessage(unsignedFixture(other.claim), demos),
        ).rejects.toThrow(/does not match/)
    })

    it("refuses non-demos sender", async () => {
        const { demos } = await newConnectedDemos()
        const fx = unsignedFixture("eip155:0x1234" as ClaimReference)
        await expect(signChannelMessage(fx, demos)).rejects.toThrow(
            /demos:/,
        )
    })

    it("refuses sequence < 1", async () => {
        const { demos, claim } = await newConnectedDemos()
        await expect(
            signChannelMessage(unsignedFixture(claim, { sequence: 0 }), demos),
        ).rejects.toThrow(/sequence/)
    })
})

describe("InMemoryChannelIdRegistry (CH-6)", () => {
    it("rejects channelId reuse", async () => {
        const reg = new InMemoryChannelIdRegistry()
        await reg.register("ch-A")
        await expect(reg.register("ch-A")).rejects.toThrow(
            /already registered/,
        )
    })

    it("allows distinct channelIds", async () => {
        const reg = new InMemoryChannelIdRegistry()
        await reg.register("ch-A")
        await reg.register("ch-B")
        expect(await reg.has("ch-A")).toBe(true)
        expect(await reg.has("ch-B")).toBe(true)
    })

    it("refuses empty channelId", async () => {
        const reg = new InMemoryChannelIdRegistry()
        await expect(reg.register("")).rejects.toThrow(/required/)
    })
})

describe("ChannelSession (WI-2)", () => {
    let alice: { demos: Demos; claim: ClaimReference }
    let bob: { demos: Demos; claim: ClaimReference }

    beforeEach(async () => {
        alice = await newConnectedDemos()
        bob = await newConnectedDemos()
    })

    it("rejects me ∉ members", () => {
        expect(
            () =>
                new ChannelSession({
                    channelId: CHANNEL,
                    members: [bob.claim],
                    me: alice.claim,
                    demos: alice.demos,
                }),
        ).toThrow(/not in members/)
    })

    it("sendOutgoing → counterparty.receiveIncoming roundtrips", async () => {
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        const bSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()

        const msg = await aSes.sendOutgoing({ type: "offer", body: { x: 1 } })
        expect(msg.sequence).toBe(1)
        await expect(bSes.receiveIncoming(msg)).resolves.toBeUndefined()

        const reply = await bSes.sendOutgoing({
            type: "counter",
            body: { x: 2 },
            repliesTo: 1,
        })
        expect(reply.sequence).toBe(2)
        expect(reply.refs?.repliesTo).toBe(1)
        await expect(aSes.receiveIncoming(reply)).resolves.toBeUndefined()
    })

    it("rejects out-of-order incoming sequence", async () => {
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        const bSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()

        const m1 = await aSes.sendOutgoing({ type: "offer", body: 1 })
        const m2 = await aSes.sendOutgoing({ type: "offer", body: 2 })
        await bSes.receiveIncoming(m2)
        await expect(bSes.receiveIncoming(m1)).rejects.toThrow(
            /non-monotonic/,
        )
    })

    it("rejects duplicate incoming sequence", async () => {
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        const bSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()

        const m1 = await aSes.sendOutgoing({ type: "offer", body: 1 })
        await bSes.receiveIncoming(m1)
        await expect(bSes.receiveIncoming(m1)).rejects.toThrow(
            /non-monotonic/,
        )
    })

    it("rejects message with different channelId (replay into wrong channel)", async () => {
        const aSes = new ChannelSession({
            channelId: "ch-A",
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        const bSes = new ChannelSession({
            channelId: "ch-B",
            members: [alice.claim, bob.claim],
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()

        const m1 = await aSes.sendOutgoing({ type: "offer", body: 1 })
        await expect(bSes.receiveIncoming(m1)).rejects.toThrow(
            /channelId mismatch/,
        )
    })

    it("rejects message from non-member sender", async () => {
        const eve = await newConnectedDemos()
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        await aSes.open()
        const eveMsg = await signChannelMessage(
            unsignedFixture(eve.claim, { sequence: 1 }),
            eve.demos,
        )
        await expect(aSes.receiveIncoming(eveMsg)).rejects.toThrow(
            /not in members/,
        )
    })

    it("rejects message with invalid signature", async () => {
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        const bSes = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()
        const m1 = await aSes.sendOutgoing({ type: "offer", body: 1 })
        const tampered: ChannelMessage = { ...m1, body: 999 }
        await expect(bSes.receiveIncoming(tampered)).rejects.toThrow(
            /signature/,
        )
    })

    it("CH-6: registry rejects channelId reuse across sessions", async () => {
        const registry = new InMemoryChannelIdRegistry()
        const a = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim],
            me: alice.claim,
            demos: alice.demos,
            channelIdRegistry: registry,
        })
        await a.open()

        const b = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim],
            me: alice.claim,
            demos: alice.demos,
            channelIdRegistry: registry,
        })
        await expect(b.open()).rejects.toThrow(/CH-6/)
    })

    it("refuses sendOutgoing before open", async () => {
        const a = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        await expect(
            a.sendOutgoing({ type: "offer", body: {} }),
        ).rejects.toThrow(/open/)
    })

    it("messages() returns ordered local transcript", async () => {
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
        const m1 = await a.sendOutgoing({ type: "offer", body: 1 })
        await b.receiveIncoming(m1)
        const m2 = await b.sendOutgoing({ type: "counter", body: 2 })
        await a.receiveIncoming(m2)

        expect(a.messages().map(m => m.sequence)).toEqual([1, 2])
        expect(b.messages().map(m => m.sequence)).toEqual([1, 2])
    })

    it("stripChannelMessageSignature drops signature only", async () => {
        const { demos, claim } = await newConnectedDemos()
        const signed = await signChannelMessage(unsignedFixture(claim), demos)
        const stripped = stripChannelMessageSignature(signed)
        expect("signature" in stripped).toBe(false)
        expect(stripped.sequence).toBe(signed.sequence)
    })
})

describe("Transcript (WI-2 → consumed by WI-3)", () => {
    let alice: { demos: Demos; claim: ClaimReference }
    let bob: { demos: Demos; claim: ClaimReference }

    beforeEach(async () => {
        alice = await newConnectedDemos()
        bob = await newConnectedDemos()
    })

    async function runSession(): Promise<{
        members: ClaimReference[]
        messages: ChannelMessage[]
    }> {
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
            type: "counter",
            body: { price: 90 },
            repliesTo: 1,
        })
        await a.receiveIncoming(m2)
        const m3 = await a.sendOutgoing({
            type: "accept",
            body: {},
            repliesTo: 2,
        })
        await b.receiveIncoming(m3)
        return {
            members: [alice.claim, bob.claim],
            messages: [m1, m2, m3],
        }
    }

    it("exportTranscript produces a transcript that re-verifies", async () => {
        const { members, messages } = await runSession()
        const t = await exportTranscript({
            channelId: CHANNEL,
            members,
            messages,
            signers: [
                { claim: alice.claim, demos: alice.demos },
                { claim: bob.claim, demos: bob.demos },
            ],
        })
        expect(t.transcriptVersion).toBe("1")
        expect(t.signatures.length).toBe(2)
        const result = verifyTranscript(t)
        expect(result.ok).toBe(true)
        expect(result.errors).toEqual([])
    })

    it("verifyTranscript catches a tampered message", async () => {
        const { members, messages } = await runSession()
        const t = await exportTranscript({
            channelId: CHANNEL,
            members,
            messages,
            signers: [{ claim: alice.claim, demos: alice.demos }],
        })
        const tampered = {
            ...t,
            messages: [{ ...t.messages[0], body: { price: 1 } }, ...t.messages.slice(1)],
        }
        const result = verifyTranscript(tampered)
        expect(result.ok).toBe(false)
        expect(result.errors.some(e => /signature verification/.test(e))).toBe(
            true,
        )
    })

    it("verifyTranscript catches non-member transcript signer", async () => {
        const { members, messages } = await runSession()
        const eve = await newConnectedDemos()
        const t = await exportTranscript({
            channelId: CHANNEL,
            members,
            messages,
            signers: [{ claim: eve.claim, demos: eve.demos }],
        })
        const result = verifyTranscript(t)
        expect(result.ok).toBe(false)
        expect(
            result.errors.some(e => /not in members/.test(e)),
        ).toBe(true)
    })

    it("signTranscript refuses non-demos signer", async () => {
        const { members, messages } = await runSession()
        const unsigned = {
            transcriptVersion: "1" as const,
            channelId: CHANNEL,
            members,
            messages,
            generatedAt: 1700000000000,
        }
        await expect(
            signTranscript(
                unsigned,
                "eip155:0xabc" as ClaimReference,
                alice.demos,
            ),
        ).rejects.toThrow(/demos:/)
    })
})

describe("ChannelSession.sendOutgoing — concurrency (P1 regression)", () => {
    // Regression for greptile P1 on session.ts: sendOutgoing read
    // `highestSeen` BEFORE await signChannelMessage and wrote it AFTER,
    // so two unawaited concurrent calls produced duplicate sequence
    // numbers. Post-fix, the slot is reserved synchronously via ++.
    it("two unawaited sendOutgoing calls get distinct, monotonic sequence numbers", async () => {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const session = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        await session.open()

        // Fire BOTH calls before awaiting either, then await together.
        const p1 = session.sendOutgoing({ type: "offer", body: { i: 1 } })
        const p2 = session.sendOutgoing({ type: "offer", body: { i: 2 } })
        const [m1, m2] = await Promise.all([p1, p2])

        expect(m1.sequence).not.toBe(m2.sequence)
        const seen = [m1.sequence, m2.sequence].sort()
        expect(seen).toEqual([1, 2])
    })

    it("burst of 5 concurrent sendOutgoing calls gets 5 distinct sequences", async () => {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const session = new ChannelSession({
            channelId: CHANNEL,
            members: [alice.claim, bob.claim],
            me: alice.claim,
            demos: alice.demos,
        })
        await session.open()

        const promises = Array.from({ length: 5 }, (_, i) =>
            session.sendOutgoing({ type: "offer", body: { i } }),
        )
        const msgs = await Promise.all(promises)
        const seqs = msgs.map(m => m.sequence).sort((a, b) => a - b)
        expect(seqs).toEqual([1, 2, 3, 4, 5])
    })
})
