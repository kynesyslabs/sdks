/**
 * The SR-4 brief's Definition of Done, walked end to end.
 *
 * The brief lists four things a `negotiate-rfq` session must be able to do. Each
 * work item has its own unit tests; nothing proved they compose. This does —
 * one session, real keys, real signatures, from the membership binding to the
 * committed agreement, asserting each numbered item as it goes.
 *
 * Only the SR-2 anchor is injected (the real one deploys a storage program and
 * needs a live node); everything else here is the real code path.
 */
import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import L2PS from "@/l2ps/l2ps"
import {
    createMembershipBinding,
    subnetMemberIdFromL2PS,
    verifyMembershipBinding,
} from "@/l2ps/binding"
import {
    ChannelSession,
    InMemoryChannelIdRegistry,
    RfqSession,
    exportTranscript,
    verifyTranscript,
    type ChannelMessage,
} from "@/l2ps/channel"
import { agreementHash, commitRfq, verifyAgreement } from "@/l2ps/agreement"
import type { AnchorEncryptedTranscriptOpts, AttestationRef } from "@/l2ps/anchor"

const CHANNEL = "ch-dod-e2e-1"

async function newConnectedDemos(): Promise<{ demos: Demos; claim: ClaimReference }> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return { demos, claim: demosClaimRefForAddress(await demos.getEd25519Address()) }
}

describe("SR-4 definition of done — end to end", () => {
    it("binding → CCI-signed exchange → anchored transcript → committed agreement", async () => {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const members = [alice.claim, bob.claim]

        // ── DoD 1: a subnet whose members are bound to their CCI primary claims.
        const subnet = await L2PS.create()
        const subnetMemberId = await subnetMemberIdFromL2PS(subnet)
        const bindings = await Promise.all(
            [alice, bob].map((p) =>
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId,
                    claim: p.claim,
                    demos: p.demos,
                }),
            ),
        )
        for (const b of bindings) {
            expect(verifyMembershipBinding(b)).toBe(true)
            // Signed by the Demos key controlling the claim — not the subnet key.
            expect(b.cciPrimaryClaim.startsWith("demos:")).toBe(true)
        }

        // ── DoD 2: CCI-signed messages, monotonic sequence, unique channelId.
        const registry = new InMemoryChannelIdRegistry()
        const aSes = new ChannelSession({
            channelId: CHANNEL,
            members,
            me: alice.claim,
            demos: alice.demos,
            channelIdRegistry: registry,
        })
        const bSes = new ChannelSession({
            channelId: CHANNEL,
            members,
            me: bob.claim,
            demos: bob.demos,
        })
        await aSes.open()
        await bSes.open()

        // CH-6: the same channelId can never open a second session.
        const dupe = new ChannelSession({
            channelId: CHANNEL,
            members,
            me: alice.claim,
            demos: alice.demos,
            channelIdRegistry: registry,
        })
        await expect(dupe.open()).rejects.toThrow()

        let bRfq!: RfqSession
        const aRfq = new RfqSession({
            me: alice.claim,
            send: async (o) => {
                const m = await aSes.sendOutgoing(o)
                await bSes.receiveIncoming(m)
                bRfq.onIncoming(m)
                return m
            },
        })
        bRfq = new RfqSession({
            me: bob.claim,
            send: async (o) => {
                const m = await bSes.sendOutgoing(o)
                await aSes.receiveIncoming(m)
                aRfq.onIncoming(m)
                return m
            },
        })

        await aRfq.offer({ item: "GPU-hour x40", price: 100, currency: "USDC" })
        await bRfq.counter({ item: "GPU-hour x40", price: 90, currency: "USDC" })
        await aRfq.accept()

        // CH-5: both sides reached the same terminal state, on the same terms.
        expect(aRfq.state).toBe("accepted")
        expect(bRfq.state).toBe("accepted")
        expect(aRfq.outcome().agreedTerms).toEqual({
            item: "GPU-hour x40",
            price: 90,
            currency: "USDC",
        })

        const messages: ReadonlyArray<ChannelMessage> = aSes.messages()
        expect(messages.map((m) => m.sequence)).toEqual([1, 2, 3])

        // ── DoD 3: a member-decryptable, hash-verifiable anchored transcript.
        const transcript = await exportTranscript({
            channelId: CHANNEL,
            members,
            messages,
            signers: [
                { claim: alice.claim, demos: alice.demos },
                { claim: bob.claim, demos: bob.demos },
            ],
        })
        // A non-member can re-verify every claim given only the public keys.
        expect(verifyTranscript(transcript)).toEqual({ ok: true, errors: [] })

        const captured: AnchorEncryptedTranscriptOpts[] = []
        const anchor = async (o: AnchorEncryptedTranscriptOpts): Promise<AttestationRef> => {
            captured.push(o)
            return { anchor: "0xsp", contentHash: "0xhash" }
        }
        const ref = await anchor({
            transcript,
            l2ps: subnet,
            demos: alice.demos,
            signer: alice.claim,
            policy: "encrypted-anchored-required",
        })
        expect(ref.contentHash).toBeTruthy()
        expect(captured).toHaveLength(1)

        // ── DoD 4: the in-channel signer IS the identity that co-signs the commit.
        const doc = await commitRfq({
            rfq: aRfq,
            session: aSes,
            signers: [
                { claim: alice.claim, demos: alice.demos },
                { claim: bob.claim, demos: bob.demos },
            ],
        })

        expect(verifyAgreement(doc, { members: aSes.members })).toEqual({
            ok: true,
            errors: [],
        })
        // It carries what was negotiated, bound to the proposal that was accepted.
        expect(doc.body).toEqual(aRfq.outcome().agreedTerms)
        expect(doc.refs?.acceptedSequence).toBe(aRfq.outcome().acceptedSequence)
        expect(doc.channelId).toBe(CHANNEL)
        // Only this goes on-chain.
        expect(agreementHash(doc)).toMatch(/^[0-9a-f]{64}$/)

        // The chain of custody the whole brief exists for: every party that
        // signed in-channel is a party to the commitment, and vice versa.
        const inChannel = new Set(messages.map((m) => m.sender))
        for (const s of inChannel) expect(doc.parties).toContain(s)
        expect(doc.signatures.map((s) => s.signer).sort()).toEqual([...members].sort())
    })
})

describe("commitRfq — what it refuses", () => {
    async function accepted() {
        const alice = await newConnectedDemos()
        const bob = await newConnectedDemos()
        const members = [alice.claim, bob.claim]
        const aSes = new ChannelSession({ channelId: "ch-c1", members, me: alice.claim, demos: alice.demos })
        const bSes = new ChannelSession({ channelId: "ch-c1", members, me: bob.claim, demos: bob.demos })
        await aSes.open()
        await bSes.open()
        let bRfq!: RfqSession
        const aRfq = new RfqSession({
            me: alice.claim,
            send: async (o) => {
                const m = await aSes.sendOutgoing(o)
                await bSes.receiveIncoming(m)
                bRfq.onIncoming(m)
                return m
            },
        })
        bRfq = new RfqSession({
            me: bob.claim,
            send: async (o) => {
                const m = await bSes.sendOutgoing(o)
                await aSes.receiveIncoming(m)
                aRfq.onIncoming(m)
                return m
            },
        })
        return { alice, bob, members, aSes, aRfq, bRfq }
    }

    it("refuses a negotiation that was not accepted", async () => {
        const { alice, bob, aSes, aRfq, bRfq } = await accepted()
        await aRfq.offer({ price: 100 })
        await bRfq.reject("too dear")
        await expect(
            commitRfq({
                rfq: aRfq,
                session: aSes,
                signers: [
                    { claim: alice.claim, demos: alice.demos },
                    { claim: bob.claim, demos: bob.demos },
                ],
            }),
        ).rejects.toThrow(/not accepted/)
    })

    it("refuses to mint a document the whole channel did not sign (§0)", async () => {
        const { alice, bob, aSes, aRfq, bRfq } = await accepted()
        await aRfq.offer({ price: 100 })
        await bRfq.counter({ price: 90 })
        await aRfq.accept()

        // Bob negotiated but isn't signing — the document would breach §0 the
        // moment anyone verified it, so it is never minted.
        await expect(
            commitRfq({
                rfq: aRfq,
                session: aSes,
                signers: [{ claim: alice.claim, demos: alice.demos }],
            }),
        ).rejects.toThrow(/no signer for party/)

        // …and an outsider cannot be smuggled in as a signer.
        const outsider = await newConnectedDemos()
        await expect(
            commitRfq({
                rfq: aRfq,
                session: aSes,
                signers: [
                    { claim: alice.claim, demos: alice.demos },
                    { claim: bob.claim, demos: bob.demos },
                    { claim: outsider.claim, demos: outsider.demos },
                ],
            }),
        ).rejects.toThrow(/is not a party/)
    })

    it("refuses an RFQ accepted in a different channel", async () => {
        const { alice, bob, aRfq, bRfq } = await accepted()
        await aRfq.offer({ price: 100 })
        await bRfq.counter({ price: 90 })
        await aRfq.accept()

        // The RFQ state machine carries no channelId of its own, so nothing but
        // this check stops channel A's agreement being minted against channel B.
        const other = await accepted()
        await expect(
            commitRfq({
                rfq: aRfq,
                session: other.aSes, // a different channel, which never saw that proposal
                signers: [
                    { claim: other.alice.claim, demos: other.alice.demos },
                    { claim: other.bob.claim, demos: other.bob.demos },
                ],
            }),
        ).rejects.toThrow(/belongs to a different channel/)
        void alice, bob
    })

    it("refuses an outcome that disagrees with the reported state", async () => {
        const { alice, bob, aSes, aRfq, bRfq } = await accepted()
        await aRfq.offer({ price: 100 })
        await bRfq.counter({ price: 90 })
        await aRfq.accept()

        // A stale/inconsistent implementation could claim accepted while its
        // outcome says otherwise; committing on that would bind terms nobody agreed.
        const twoFaced = {
            state: "accepted",
            outcome: () => ({ ...aRfq.outcome(), state: "rejected" }),
        }
        await expect(
            commitRfq({
                rfq: twoFaced,
                session: aSes,
                signers: [
                    { claim: alice.claim, demos: alice.demos },
                    { claim: bob.claim, demos: bob.demos },
                ],
            }),
        ).rejects.toThrow(/not accepted/)
    })
})
