import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import {
    ChannelSession,
    SealedEnvelopeSession,
    finalizeSealedEnvelope,
    type RevealedBid,
} from "@/l2ps/channel"
import type { SealedEnvelopeLike } from "@/l2ps/channel/finalizeSealed"
import type {
    AnchorEncryptedTranscriptOpts,
    AttestationRef,
} from "@/l2ps/anchor"

const CHANNEL = "ch-sealed-finalize-1"

const byPrice = (a: RevealedBid, b: RevealedBid): number =>
    (a.bid as { price: number }).price - (b.bid as { price: number }).price

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

/**
 * Run a real signed two-party sealed auction to a terminal state so the
 * session holds a verifiable transcript. `stopAfter` lets a caller leave it
 * mid-reveal for the "not closed" guard. Only the anchor is mocked (real
 * ChannelSession, real CCI signing).
 */
async function resolvedAuction(stopAfter?: "reveal-a") {
    const alice = await newConnectedDemos()
    const bob = await newConnectedDemos()
    const members = [alice.claim, bob.claim]
    const aSes = new ChannelSession({ channelId: CHANNEL, members, me: alice.claim, demos: alice.demos })
    const bSes = new ChannelSession({ channelId: CHANNEL, members, me: bob.claim, demos: bob.demos })
    await aSes.open()
    await bSes.open()

    let aSeal!: SealedEnvelopeSession
    let bSeal!: SealedEnvelopeSession
    aSeal = new SealedEnvelopeSession({
        me: alice.claim,
        participants: members,
        compareBids: byPrice,
        send: async opts => {
            const m = await aSes.sendOutgoing(opts)
            await bSes.receiveIncoming(m)
            bSeal.onIncoming(m)
            return m
        },
    })
    bSeal = new SealedEnvelopeSession({
        me: bob.claim,
        participants: members,
        compareBids: byPrice,
        send: async opts => {
            const m = await bSes.sendOutgoing(opts)
            await aSes.receiveIncoming(m)
            aSeal.onIncoming(m)
            return m
        },
    })

    await aSeal.commit({ price: 90 })
    await bSeal.commit({ price: 100 })
    await aSeal.reveal()
    if (stopAfter === "reveal-a") return { alice, bob, aSes, aSeal, members }
    await bSeal.reveal()
    return { alice, bob, aSes, aSeal, members }
}

const okAnchor =
    (captured: AnchorEncryptedTranscriptOpts[]) =>
    async (o: AnchorEncryptedTranscriptOpts): Promise<AttestationRef> => {
        captured.push(o)
        return { anchor: "0xsp-addr", contentHash: "0xhash" }
    }

describe("finalizeSealedEnvelope — transcript anchor on a resolved auction", () => {
    it("exports a signed transcript and anchors under `required`", async () => {
        const { alice, bob, aSes, aSeal } = await resolvedAuction()
        expect(aSeal.state).toBe("closed")
        expect(aSeal.outcome().winner).toBe(bob.claim) // 100 beats 90
        expect(aSeal.outcome().winningBid).toEqual({ price: 100 })

        const captured: AnchorEncryptedTranscriptOpts[] = []
        const res = await finalizeSealedEnvelope({
            sealed: aSeal,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            l2ps: {} as never, // only forwarded to the (mocked) anchor
            policy: "encrypted-anchored-required",
            anchor: okAnchor(captured),
        })

        expect(res.channelTranscriptRef).toEqual({ anchor: "0xsp-addr", contentHash: "0xhash" })
        expect(res.transcript.channelId).toBe(CHANNEL)
        expect(res.transcript.messages).toHaveLength(4) // 2 commits + 2 reveals
        expect(res.transcript.signatures[0].signer).toBe(alice.claim)
        expect(captured).toHaveLength(1)
        expect(captured[0].policy).toBe("encrypted-anchored-required")
    })

    it("under `none` produces the transcript but anchors nothing", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        const captured: AnchorEncryptedTranscriptOpts[] = []
        const res = await finalizeSealedEnvelope({
            sealed: aSeal,
            session: aSes,
            signer: alice.claim,
            demos: alice.demos,
            policy: "none",
            anchor: okAnchor(captured),
        })
        expect(res.channelTranscriptRef).toBeNull()
        expect(res.transcript.messages).toHaveLength(4)
        expect(captured).toHaveLength(0)
    })

    it("under `recommended` anchors only with explicit consent", async () => {
        const withConsent = await resolvedAuction()
        const cap1: AnchorEncryptedTranscriptOpts[] = []
        const a = await finalizeSealedEnvelope({
            sealed: withConsent.aSeal,
            session: withConsent.aSes,
            signer: withConsent.alice.claim,
            demos: withConsent.alice.demos,
            l2ps: {} as never,
            policy: "encrypted-anchored-recommended",
            consent: true,
            anchor: okAnchor(cap1),
        })
        expect(a.channelTranscriptRef).not.toBeNull()
        expect(cap1).toHaveLength(1)

        const without = await resolvedAuction()
        const cap2: AnchorEncryptedTranscriptOpts[] = []
        const b = await finalizeSealedEnvelope({
            sealed: without.aSeal,
            session: without.aSes,
            signer: without.alice.claim,
            demos: without.alice.demos,
            policy: "encrypted-anchored-recommended",
            anchor: okAnchor(cap2),
        })
        expect(b.channelTranscriptRef).toBeNull()
        expect(cap2).toHaveLength(0)
    })

    it("refuses to finalise an auction that has not closed", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction("reveal-a")
        expect(aSeal.state).toBe("reveal") // bob still owes a reveal
        await expect(
            finalizeSealedEnvelope({
                sealed: aSeal,
                session: aSes,
                signer: alice.claim,
                demos: alice.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/not "closed"/)
    })

    it("refuses a signer that is not a channel member", async () => {
        const { aSes, aSeal } = await resolvedAuction()
        const outsider = await newConnectedDemos()
        await expect(
            finalizeSealedEnvelope({
                sealed: aSeal,
                session: aSes,
                signer: outsider.claim,
                demos: outsider.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/not a channel member/)
    })

    it("under `required`, an anchor that produces no ref fails the phase", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        await expect(
            finalizeSealedEnvelope({
                sealed: aSeal,
                session: aSes,
                signer: alice.claim,
                demos: alice.demos,
                l2ps: {} as never,
                policy: "encrypted-anchored-required",
                anchor: async () => null,
            }),
        ).rejects.toThrow(/produced no attestation/)
    })

    it("refuses to anchor a transcript that does not back the reported reveals", async () => {
        const { alice, aSes } = await resolvedAuction()
        // A hand-forged outcome pointing at a reveal sequence the real session
        // never carried — finalize must not export/anchor over the gap.
        const liar: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({
                state: "closed",
                reveals: [{ participant: alice.claim, bid: { price: 1 }, sequence: 999 }],
                disqualified: [],
            }),
        }
        await expect(
            finalizeSealedEnvelope({
                sealed: liar,
                session: aSes,
                signer: alice.claim,
                demos: alice.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/does not contain .* reveal \(seq 999\)/)
    })
})
