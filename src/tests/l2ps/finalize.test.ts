import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import {
    ChannelSession,
    RfqSession,
    finalizeRfq,
    type ChannelMessage,
} from "@/l2ps/channel"
import type {
    AnchorEncryptedTranscriptOpts,
    AttestationRef,
} from "@/l2ps/anchor"

const CHANNEL = "ch-finalize-1"

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

/** Run a real signed offer→accept so the session holds a verifiable transcript. */
async function agreedSession() {
    const alice = await newConnectedDemos()
    const bob = await newConnectedDemos()
    const members = [alice.claim, bob.claim]
    const aSes = new ChannelSession({
        channelId: CHANNEL,
        members,
        me: alice.claim,
        demos: alice.demos,
    })
    const bSes = new ChannelSession({
        channelId: CHANNEL,
        members,
        me: bob.claim,
        demos: bob.demos,
    })
    await aSes.open()
    await bSes.open()

    const aRfq = new RfqSession({
        me: alice.claim,
        send: async opts => {
            const m = await aSes.sendOutgoing(opts)
            await bSes.receiveIncoming(m)
            bRfq.onIncoming(m)
            return m
        },
    })
    const bRfq = new RfqSession({
        me: bob.claim,
        send: async opts => {
            const m = await bSes.sendOutgoing(opts)
            await aSes.receiveIncoming(m)
            aRfq.onIncoming(m)
            return m
        },
    })

    await aRfq.offer({ price: 100 })
    await bRfq.counter({ price: 90 })
    await aRfq.accept()
    return { alice, aSes, aRfq }
}

const okAnchor =
    (captured: AnchorEncryptedTranscriptOpts[]) =>
    async (o: AnchorEncryptedTranscriptOpts): Promise<AttestationRef> => {
        captured.push(o)
        return { anchor: "0xsp-addr", contentHash: "0xhash" }
    }

describe("finalizeRfq — WI-C transcript anchor on terminal", () => {
    it("exports a signed transcript and anchors under `required`", async () => {
        const { alice, aSes, aRfq } = await agreedSession()
        const captured: AnchorEncryptedTranscriptOpts[] = []
        const res = await finalizeRfq({
            rfq: aRfq,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            l2ps: {} as never, // anchor is faked; l2ps only needs to be present
            policy: "encrypted-anchored-required",
            anchor: okAnchor(captured),
        })
        expect(res.transcript.messages.map(m => m.sequence)).toEqual([1, 2, 3])
        expect(res.transcript.signatures.length).toBe(1) // signed by alice
        expect(res.channelTranscriptRef).toEqual({
            anchor: "0xsp-addr",
            contentHash: "0xhash",
        })
        expect(captured[0].policy).toBe("encrypted-anchored-required")
    })

    it("policy `none` exports the transcript but does not anchor", async () => {
        const { alice, aSes, aRfq } = await agreedSession()
        let anchored = false
        const res = await finalizeRfq({
            rfq: aRfq,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            policy: "none",
            anchor: async () => {
                anchored = true
                return null
            },
        })
        expect(res.channelTranscriptRef).toBeNull()
        expect(anchored).toBe(false)
        expect(res.transcript.messages.length).toBe(3)
    })

    it("`recommended` without consent does not anchor (ref null)", async () => {
        const { alice, aSes, aRfq } = await agreedSession()
        const res = await finalizeRfq({
            rfq: aRfq,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            l2ps: {} as never,
            policy: "encrypted-anchored-recommended",
            consent: false,
            // mimic the real helper: recommended + no consent → null
            anchor: async o => (o.consent === true ? { anchor: "a", contentHash: "h" } : null),
        })
        expect(res.channelTranscriptRef).toBeNull()
    })

    it("`required` fails the phase when anchoring returns null", async () => {
        const { alice, aSes, aRfq } = await agreedSession()
        await expect(
            finalizeRfq({
                rfq: aRfq,
                session: aSes,
                signer: alice.claim,
                demos: alice.demos,
                l2ps: {} as never,
                policy: "encrypted-anchored-required",
                anchor: async () => null,
            }),
        ).rejects.toThrow(/phase fails/)
    })

    it("refuses to finalize a non-accepted negotiation", async () => {
        const alice = await newConnectedDemos()
        const fakeRfq = { state: "open" as const, outcome: () => ({ state: "open" as const }) }
        const fakeSession = {
            channelId: CHANNEL,
            members: [alice.claim],
            messages: () => [] as ChannelMessage[],
        }
        await expect(
            finalizeRfq({
                rfq: fakeRfq,
                session: fakeSession,
                signer: alice.claim,
                demos: alice.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/not "accepted"/)
    })

    it("requires an L2PS instance when the policy anchors", async () => {
        const { alice, aSes, aRfq } = await agreedSession()
        await expect(
            finalizeRfq({
                rfq: aRfq,
                session: aSes,
                signer: alice.claim,
                demos: alice.demos,
                policy: "encrypted-anchored-required",
                // no l2ps, no anchor override
            }),
        ).rejects.toThrow(/requires an L2PS instance/)
    })

    it("`recommended` without consent succeeds without an L2PS instance", async () => {
        // No-anchor outcome must not require l2ps just to take the null
        // branch (regression: the l2ps check used to run first).
        const { alice, aSes, aRfq } = await agreedSession()
        const res = await finalizeRfq({
            rfq: aRfq,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            policy: "encrypted-anchored-recommended",
            consent: false,
            // no l2ps, no anchor override
        })
        expect(res.channelTranscriptRef).toBeNull()
        expect(res.transcript.messages.length).toBe(3)
    })

    it("rejects a signer who is not a channel member", async () => {
        const { aSes, aRfq } = await agreedSession()
        const stranger = await newConnectedDemos()
        await expect(
            finalizeRfq({
                rfq: aRfq,
                session: aSes,
                signer: stranger.claim, // not in members
                demos: stranger.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/not a channel member/)
    })

    it("rejects a session whose transcript lacks the accepted exchange", async () => {
        const { alice } = await agreedSession()
        // An accepted RFQ outcome pointing at seq 2, but a session whose
        // messages don't contain that proposal/accept → mismatch.
        const mismatchedRfq = {
            state: "accepted" as const,
            outcome: () => ({
                state: "accepted" as const,
                agreedTerms: { price: 90 },
                acceptedSequence: 2,
            }),
        }
        const emptySession = {
            channelId: CHANNEL,
            members: [alice.claim],
            messages: () => [] as ChannelMessage[],
        }
        await expect(
            finalizeRfq({
                rfq: mismatchedRfq,
                session: emptySession,
                signer: alice.claim,
                demos: alice.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/session mismatch/)
    })
})
