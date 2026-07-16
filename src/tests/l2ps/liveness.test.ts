import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import { ChannelSession, checkLiveness, DEFAULT_LIVENESS } from "@/l2ps/channel"

const CHANNEL = "ch-liveness-1"

async function newConnectedDemos(): Promise<{ demos: Demos; claim: ClaimReference }> {
    const auth = new DemosWebAuth()
    await auth.create()
    const demos = new Demos()
    await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
    return { demos, claim: demosClaimRefForAddress(await demos.getEd25519Address()) }
}

describe("CH-4 checkLiveness — the pure bound", () => {
    const base = { openedAt: 1_000, lastActivityAt: 1_000 }

    it("is alive inside the turn bound and reports when it flips", () => {
        const r = checkLiveness({ ...base, policy: { turnTimeoutMs: 100 }, now: 1_050 })
        expect(r.status).toBe("alive")
        expect(r.msSinceLastActivity).toBe(50)
        expect(r.deadlineAt).toBe(1_100)
    })

    it("stalls exactly at the deadline, not a tick later", () => {
        expect(checkLiveness({ ...base, policy: { turnTimeoutMs: 100 }, now: 1_099 }).status).toBe("alive")
        const r = checkLiveness({ ...base, policy: { turnTimeoutMs: 100 }, now: 1_100 })
        expect(r).toMatchObject({ status: "stalled", reason: "turn-timeout", deadlineAt: 1_100 })
    })

    it("honours an absolute session cap even while traffic keeps flowing", () => {
        // Chatty but past the overall cap: still over, or "bounded" means nothing.
        const r = checkLiveness({
            openedAt: 1_000,
            lastActivityAt: 5_990, // just spoke
            policy: { turnTimeoutMs: 100, sessionTimeoutMs: 5_000 },
            now: 6_000,
        })
        expect(r).toMatchObject({ status: "stalled", reason: "session-timeout", deadlineAt: 6_000 })
    })

    it("reports the nearer of the two deadlines while alive", () => {
        const r = checkLiveness({
            openedAt: 1_000,
            lastActivityAt: 1_000,
            policy: { turnTimeoutMs: 10_000, sessionTimeoutMs: 5_000 },
            now: 1_100,
        })
        expect(r).toMatchObject({ status: "alive", deadlineAt: 6_000 }) // session cap is nearer
    })

    it("rejects a nonsensical policy", () => {
        expect(() => checkLiveness({ ...base, policy: { turnTimeoutMs: 0 } })).toThrow(/positive number/)
        expect(() => checkLiveness({ ...base, policy: { turnTimeoutMs: -1 } })).toThrow(/positive number/)
        expect(() =>
            checkLiveness({ ...base, policy: { turnTimeoutMs: 100, sessionTimeoutMs: 0 } }),
        ).toThrow(/positive number/)
        expect(DEFAULT_LIVENESS.turnTimeoutMs).toBeGreaterThan(0)
    })
})

describe("CH-4 ChannelSession.liveness — detect the stall, then abort", () => {
    async function session() {
        let now = 1_000
        const me = await newConnectedDemos()
        const peer = await newConnectedDemos()
        const members = [me.claim, peer.claim]
        const mine = new ChannelSession({
            channelId: CHANNEL,
            members,
            me: me.claim,
            demos: me.demos,
            now: () => now,
        })
        const theirs = new ChannelSession({
            channelId: CHANNEL,
            members,
            me: peer.claim,
            demos: peer.demos,
            now: () => now,
        })
        await mine.open()
        await theirs.open()
        return { mine, theirs, tick: (ms: number) => (now += ms), at: () => now }
    }

    it("goes stalled once the counterparty falls quiet past the bound", async () => {
        const { mine, tick } = await session()
        expect(mine.liveness({ turnTimeoutMs: 100 }).status).toBe("alive")
        tick(100)
        expect(mine.liveness({ turnTimeoutMs: 100 })).toMatchObject({
            status: "stalled",
            reason: "turn-timeout",
        })
    })

    it("traffic this member actually observed resets the bound", async () => {
        const { mine, theirs, tick } = await session()
        tick(90)
        const offer = await mine.sendOutgoing({ type: "offer", body: { price: 100 } })
        await theirs.receiveIncoming(offer) // keep the shared sequence in step
        tick(90) // 180ms since open, but only 90 since we last spoke
        expect(mine.liveness({ turnTimeoutMs: 100 }).status).toBe("alive")

        // Receiving also counts as observed traffic.
        const m = await theirs.sendOutgoing({ type: "counter", body: { price: 90 } })
        await mine.receiveIncoming(m)
        tick(99)
        expect(mine.liveness({ turnTimeoutMs: 100 }).status).toBe("alive")
        tick(1)
        expect(mine.liveness({ turnTimeoutMs: 100 }).status).toBe("stalled")
    })

    it("a peer cannot look alive by inflating its own sentAt", async () => {
        const { mine, theirs, tick, at } = await session()
        // The peer claims it spoke far in the future — sentAt is a field it
        // fills in itself. Only what we locally observed can bound delivery.
        const m = await theirs.sendOutgoing({
            type: "counter",
            body: {},
            sentAt: at() + 1_000_000,
        })
        await mine.receiveIncoming(m)
        expect(m.sentAt).toBeGreaterThan(at()) // the lie is on the wire…

        tick(100)
        expect(mine.liveness({ turnTimeoutMs: 100 })).toMatchObject({
            status: "stalled",
            reason: "turn-timeout",
        }) // …and it buys nothing
    })

    it("refuses to report liveness before the channel is open", async () => {
        const me = await newConnectedDemos()
        const s = new ChannelSession({
            channelId: CHANNEL,
            members: [me.claim],
            me: me.claim,
            demos: me.demos,
        })
        expect(() => s.liveness()).toThrow(/call open\(\)/)
    })
})
