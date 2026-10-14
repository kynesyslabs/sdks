import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import {
    ChannelSession,
    SealedEnvelopeSession,
    commitmentHex,
    finalizeSealedEnvelope,
    type ChannelMessage,
    type ChannelSessionView,
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
            compareBids: byPrice,
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
            compareBids: byPrice,
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
            compareBids: byPrice,
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
            compareBids: byPrice,
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
                compareBids: byPrice,
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

describe("finalizeSealedEnvelope — the transcript must cryptographically back the outcome", () => {
    const fakeMsg = (
        type: ChannelMessage["type"],
        sender: ClaimReference,
        sequence: number,
        body: unknown,
    ): ChannelMessage =>
        ({
            channelId: CHANNEL,
            sequence,
            sender,
            sentAt: 1000 + sequence,
            type,
            body,
            signature: { sigVersion: "1", signature: "0x00" },
        }) as ChannelMessage

    const fakeSession = (
        members: ClaimReference[],
        messages: ChannelMessage[],
    ): ChannelSessionView => ({ channelId: CHANNEL, members, messages: () => messages })

    it("refuses a reveal that does not OPEN the commit it is paired with", async () => {
        // A mismatched session: alice's commit is to some bid, but the reveal
        // in the record opens something else. Merely "a commit + a reveal from
        // alice exist" is not enough — the reveal must reproduce the commitment.
        const alice = await newConnectedDemos()
        const session = fakeSession(
            [alice.claim],
            [
                fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: "de".repeat(32) }),
                fakeMsg("sealed-envelope-reveal", alice.claim, 2, { bid: { price: 90 }, salt: "aa" }),
            ],
        )
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({
                state: "closed",
                reveals: [{ participant: alice.claim, bid: { price: 90 }, sequence: 2 }],
                disqualified: [],
            }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/does not open the commit/)
    })

    it("accepts a reveal that genuinely opens its commit", async () => {
        const alice = await newConnectedDemos()
        const salt = "42".repeat(16)
        const bid = { price: 90 }
        const session = fakeSession(
            [alice.claim],
            [
                fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: commitmentHex(bid, salt) }),
                fakeMsg("sealed-envelope-reveal", alice.claim, 2, { bid, salt }),
            ],
        )
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [{ participant: alice.claim, bid, sequence: 2 }], disqualified: [] }),
        }
        const res = await finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" })
        expect(res.channelTranscriptRef).toBeNull()
        expect(res.transcript.messages).toHaveLength(2)
    })

    it("an all-defaulted auction must carry the commits that back the defaults", async () => {
        const alice = await newConnectedDemos()
        // bob is disqualified, but there is no commit from bob in the record → nothing backs it.
        const bob = await newConnectedDemos()
        const session = fakeSession(
            [alice.claim, bob.claim],
            [fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: "de".repeat(32) })],
        )
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [], disqualified: [alice.claim, bob.claim] }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/has no commit/)
    })

    it("finalises a real all-defaulted auction (committed, never opened)", async () => {
        const alice = await newConnectedDemos()
        const session = fakeSession(
            [alice.claim],
            [fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: "de".repeat(32) })],
        )
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [], disqualified: [alice.claim] }),
        }
        const res = await finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" })
        expect(res.transcript.messages).toHaveLength(1)
    })

    it("refuses a closed auction with nothing to anchor", async () => {
        const alice = await newConnectedDemos()
        const session = fakeSession([alice.claim], [])
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [], disqualified: [] }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/nothing to anchor/)
    })
})

describe("finalizeSealedEnvelope — the outcome must match the revealed bids", () => {
    const tamper = (
        aSeal: SealedEnvelopeSession,
        patch: Partial<ReturnType<SealedEnvelopeSession["outcome"]>>,
    ): SealedEnvelopeLike => ({
        state: aSeal.state,
        outcome: () => ({ ...aSeal.outcome(), ...patch }),
    })

    it("refuses a reported reveal bid that differs from the revealed body", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        const real = aSeal.outcome()
        const sealed = tamper(aSeal, {
            reveals: real.reveals.map(r =>
                r.participant === alice.claim ? { ...r, bid: { price: 1 } } : r,
            ),
        })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/reported bid differs/)
    })

    it("refuses an outcome that names the wrong winner", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        // alice bid 90, bob 100 — the byPrice comparator picks bob.
        const sealed = tamper(aSeal, { winner: alice.claim, winningBid: { price: 90 } })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/winner \/ winning bid does not match/)
    })

    it("refuses a right winner with a wrong winning bid", async () => {
        const { alice, bob, aSes, aSeal } = await resolvedAuction()
        const sealed = tamper(aSeal, { winner: bob.claim, winningBid: { price: 101 } })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/winner \/ winning bid does not match/)
    })

    it("refuses an outcome with no winner when the rule picks one", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        const sealed = tamper(aSeal, { winner: undefined, winningBid: undefined })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/winner \/ winning bid does not match/)
    })

    it("refuses to take a reported winner on trust when no comparator is given", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        await expect(
            finalizeSealedEnvelope({
                sealed: aSeal, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none",
            }),
        ).rejects.toThrow(/no compareBids/)
    })

    it("refuses an outcome that leaves a committer out of reveals and disqualified", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        // Bob (the real winner) is dropped; alice would "win" among who is left.
        const real = aSeal.outcome()
        const sealed = tamper(aSeal, {
            reveals: real.reveals.filter(r => r.participant === alice.claim),
            winner: alice.claim,
            winningBid: { price: 90 },
        })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/neither revealed nor disqualified/)
    })

    it("refuses the same participant reported as revealing twice", async () => {
        const { alice, aSes, aSeal } = await resolvedAuction()
        const real = aSeal.outcome()
        const sealed = tamper(aSeal, { reveals: [...real.reveals, real.reveals[0]] })
        await expect(
            finalizeSealedEnvelope({
                sealed, session: aSes, signer: alice.claim, demos: alice.demos,
                policy: "none", compareBids: byPrice,
            }),
        ).rejects.toThrow(/appears twice/)
    })
})

describe("finalizeSealedEnvelope — commits are scoped and ordered", () => {
    const fakeMsg = (
        type: ChannelMessage["type"],
        sender: ClaimReference,
        sequence: number,
        body: unknown,
    ): ChannelMessage =>
        ({
            channelId: CHANNEL, sequence, sender, sentAt: 1000 + sequence, type, body,
            signature: { sigVersion: "1", signature: "0x00" },
        }) as ChannelMessage
    const view = (members: ClaimReference[], messages: ChannelMessage[]): ChannelSessionView => ({
        channelId: CHANNEL, members, messages: () => messages,
    })
    const salt = "42".repeat(16)
    const bid = { price: 90 }

    it("refuses two commits from one sender in the channel", async () => {
        const alice = await newConnectedDemos()
        const session = view([alice.claim], [
            fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: commitmentHex(bid, salt) }),
            fakeMsg("sealed-envelope-commit", alice.claim, 2, { commitment: "de".repeat(32) }),
            fakeMsg("sealed-envelope-reveal", alice.claim, 3, { bid, salt }),
        ])
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [{ participant: alice.claim, bid, sequence: 3 }], disqualified: [] }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/committed more than once/)
    })

    it("refuses a reveal that precedes its own commit", async () => {
        const alice = await newConnectedDemos()
        const session = view([alice.claim], [
            fakeMsg("sealed-envelope-reveal", alice.claim, 1, { bid, salt }),
            fakeMsg("sealed-envelope-commit", alice.claim, 2, { commitment: commitmentHex(bid, salt) }),
        ])
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({ state: "closed", reveals: [{ participant: alice.claim, bid, sequence: 1 }], disqualified: [] }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/does not come after every commit/)
    })

    it("refuses a reveal that precedes another participant's commit", async () => {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const session = view([alice.claim, bob.claim], [
            fakeMsg("sealed-envelope-commit", alice.claim, 1, { commitment: commitmentHex(bid, salt) }),
            fakeMsg("sealed-envelope-reveal", alice.claim, 2, { bid, salt }),
            fakeMsg("sealed-envelope-commit", bob.claim, 3, { commitment: "de".repeat(32) }),
        ])
        const sealed: SealedEnvelopeLike = {
            state: "closed",
            outcome: () => ({
                state: "closed",
                reveals: [{ participant: alice.claim, bid, sequence: 2 }],
                disqualified: [bob.claim],
            }),
        }
        await expect(
            finalizeSealedEnvelope({ sealed, session, signer: alice.claim, demos: alice.demos, policy: "none" }),
        ).rejects.toThrow(/does not come after every commit/)
    })
})
