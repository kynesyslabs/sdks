import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import {
    createExperimentalSealedBid,
    verifyExperimentalSealedBidOpening,
    signChannelMessage,
    type ChannelMessage,
    type ExperimentalSealedBidContext,
} from "@/l2ps/channel"

async function bidder(): Promise<{ demos: Demos; claim: ClaimReference }> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return { demos, claim: demosClaimRefForAddress(await demos.getEd25519Address()) }
}

async function pair(
    demos: Demos,
    context: ExperimentalSealedBidContext,
    bid: unknown,
): Promise<{ commit: ChannelMessage; opening: ChannelMessage }> {
    const bodies = createExperimentalSealedBid(context, bid)
    const common = {
        channelId: context.channelId,
        sender: context.bidder,
        sentAt: 1700000000000,
    }
    return {
        commit: await signChannelMessage({
            ...common,
            sequence: 1,
            type: "sealed-envelope-commit",
            body: bodies.commit,
        }, demos),
        opening: await signChannelMessage({
            ...common,
            sequence: 2,
            type: "sealed-envelope-reveal",
            body: bodies.opening,
        }, demos),
    }
}

describe("experimental non-complete sealed bid", () => {
    it("opens a signed pair but not a copied commitment from another bidder or channel", async () => {
        const a = await bidder()
        const b = await bidder()
        const context: ExperimentalSealedBidContext = {
            auctionId: "auction-1",
            subjectKind: "job",
            subjectId: "job-1",
            channelId: "publisher-a",
            bidder: a.claim,
        }
        const { commit, opening } = await pair(a.demos, context, { price: 100 })
        expect(verifyExperimentalSealedBidOpening(context, commit, opening)).toBe(true)

        const copiedCommit = await signChannelMessage({
            channelId: "publisher-b",
            sequence: 1,
            sender: b.claim,
            sentAt: 1700000000000,
            type: "sealed-envelope-commit",
            body: commit.body,
        }, b.demos)
        const copiedOpening = await signChannelMessage({
            channelId: "publisher-b",
            sequence: 2,
            sender: b.claim,
            sentAt: 1700000000001,
            type: "sealed-envelope-reveal",
            body: opening.body,
        }, b.demos)
        expect(verifyExperimentalSealedBidOpening({ ...context, bidder: b.claim, channelId: "publisher-b" }, copiedCommit, copiedOpening)).toBe(false)
        expect(verifyExperimentalSealedBidOpening(context, copiedCommit, copiedOpening)).toBe(false)
        expect(verifyExperimentalSealedBidOpening({ ...context, channelId: "other" }, commit, opening)).toBe(false)

        const sameBidderOtherChannel = {
            ...context,
            channelId: "publisher-b",
        }
        const movedCommit = await signChannelMessage({
            channelId: sameBidderOtherChannel.channelId,
            sequence: 1,
            sender: a.claim,
            sentAt: 1700000000000,
            type: "sealed-envelope-commit",
            body: commit.body,
        }, a.demos)
        const movedOpening = await signChannelMessage({
            channelId: sameBidderOtherChannel.channelId,
            sequence: 2,
            sender: a.claim,
            sentAt: 1700000000001,
            type: "sealed-envelope-reveal",
            body: opening.body,
        }, a.demos)
        expect(verifyExperimentalSealedBidOpening(sameBidderOtherChannel, movedCommit, movedOpening)).toBe(false)

        const sameChannelOtherBidder = { ...context, bidder: b.claim }
        const reassignedCommit = await signChannelMessage({
            channelId: context.channelId,
            sequence: 1,
            sender: b.claim,
            sentAt: 1700000000000,
            type: "sealed-envelope-commit",
            body: commit.body,
        }, b.demos)
        const reassignedOpening = await signChannelMessage({
            channelId: context.channelId,
            sequence: 2,
            sender: b.claim,
            sentAt: 1700000000001,
            type: "sealed-envelope-reveal",
            body: opening.body,
        }, b.demos)
        expect(verifyExperimentalSealedBidOpening(sameChannelOtherBidder, reassignedCommit, reassignedOpening)).toBe(false)
    })

    it("binds auction and subject and rejects altered opening, signature, and ordering", async () => {
        const a = await bidder()
        const context: ExperimentalSealedBidContext = {
            auctionId: "auction-1",
            subjectKind: "listing",
            subjectId: "listing-1",
            channelId: "channel-1",
            bidder: a.claim,
        }
        const { commit, opening } = await pair(a.demos, context, { price: 100 })
        for (const altered of [
            { ...context, auctionId: "auction-2" },
            { ...context, subjectId: "listing-2" },
            { ...context, subjectKind: "job" as const },
        ]) expect(verifyExperimentalSealedBidOpening(altered, commit, opening)).toBe(false)
        const wrongBid = await signChannelMessage({
            channelId: context.channelId,
            sender: a.claim,
            sequence: opening.sequence,
            sentAt: opening.sentAt,
            type: "sealed-envelope-reveal",
            body: { ...(opening.body as object), bid: { price: 999 } },
        }, a.demos)
        expect(verifyExperimentalSealedBidOpening(context, commit, wrongBid)).toBe(false)
        expect(verifyExperimentalSealedBidOpening(context, commit, {
            ...opening,
            body: { ...(opening.body as object), bid: { price: 999 } },
        })).toBe(false)
        expect(verifyExperimentalSealedBidOpening(context, commit, {
            ...opening,
            sequence: 1,
        })).toBe(false)
        expect(verifyExperimentalSealedBidOpening(context, opening, commit)).toBe(false)
    })

    it("rejects non-injective JSON values and uses fresh high-entropy salts", async () => {
        const a = await bidder()
        const context: ExperimentalSealedBidContext = {
            auctionId: "auction-1",
            subjectKind: "job",
            subjectId: "job-1",
            channelId: "channel-1",
            bidder: a.claim,
        }
        expect(() => createExperimentalSealedBid(context, { price: NaN })).toThrow()
        expect(() => createExperimentalSealedBid(context, { price: Infinity })).toThrow()
        expect(() => createExperimentalSealedBid(context, { price: -0 })).toThrow()
        expect(() => createExperimentalSealedBid(context, { price: undefined })).toThrow()
        const first = createExperimentalSealedBid(context, { price: 100 })
        const second = createExperimentalSealedBid(context, { price: 100 })
        expect(first.opening.salt).toMatch(/^[0-9a-f]{64}$/)
        expect(first.opening.salt).not.toBe(second.opening.salt)
        expect(first.commit.commitment).not.toBe(second.commit.commitment)
        expect(Object.keys(first.commit).sort()).toEqual([
            "auctionId", "commitment", "scheme", "subjectId", "subjectKind",
        ])
        expect(first.commit).not.toHaveProperty("bid")
        expect(first.commit).not.toHaveProperty("salt")
    })

    it("does not use local timestamps as a phase or deadline decision", async () => {
        const a = await bidder()
        const context: ExperimentalSealedBidContext = {
            auctionId: "auction-1",
            subjectKind: "job",
            subjectId: "job-1",
            channelId: "channel-1",
            bidder: a.claim,
        }
        const { commit, opening } = await pair(a.demos, context, { price: 100 })
        // Timestamp differences cannot make an opening valid or invalid. The
        // caller must obtain a separate, objectively verified phase decision.
        const early = await signChannelMessage({
            channelId: context.channelId,
            sender: a.claim,
            sequence: 2,
            sentAt: commit.sentAt - 10000,
            type: "sealed-envelope-reveal",
            body: opening.body,
        }, a.demos)
        expect(verifyExperimentalSealedBidOpening(context, commit, early)).toBe(true)
    })
})
