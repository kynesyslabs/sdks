/**
 * WI-A end-to-end: two REAL Demos identities, two REAL ChannelSessions,
 * two L2PSChannelTransports, talking over an in-process relay that
 * stands in for the L2PS messaging server. Unlike transport.test.ts
 * (which mocks the session to isolate the reorder buffer), this exercises
 * the full stack: real CCI-key signing, real cross-party verification
 * (signature + sender∈members + channelId), real AES-256-GCM under a
 * shared subnet key, and the reorder buffer under realistic out-of-order
 * delivery.
 */

import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import { ChannelSession } from "@/l2ps/channel"
import {
    L2PSChannelTransport,
    type IncomingMessagePayload,
    type L2PSMessagingPeerLike,
    type SerializedEncryptedMessage,
} from "@/l2ps/channel/transport"

const CHANNEL = "ch-e2e-1"
const SUBNET_KEY = new Uint8Array(32).fill(11)

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
 * In-process two-endpoint relay simulating the messaging transport.
 * `deliver` routes a send to the *other* endpoint's handler. When
 * `hold` is true, frames are queued instead of delivered so a test can
 * flush them in an arbitrary order (offline-queue replay / reorder).
 */
class Relay {
    private handlers = new Map<string, (p: IncomingMessagePayload) => void>()
    private held: { to: string; payload: IncomingMessagePayload }[] = []
    hold = false

    endpoint(selfId: string): L2PSMessagingPeerLike {
        return {
            send: async (
                to: string,
                encrypted: SerializedEncryptedMessage,
                messageHash: string,
            ) => {
                const payload: IncomingMessagePayload = {
                    from: selfId,
                    encrypted,
                    messageHash,
                }
                if (this.hold) this.held.push({ to, payload })
                else this.dispatch(to, payload)
                return { messageHash, l2psStatus: "submitted" as const }
            },
            onMessage: handler => this.handlers.set(selfId, handler),
        }
    }

    private dispatch(to: string, payload: IncomingMessagePayload): void {
        const h = this.handlers.get(to)
        if (h) h(payload)
    }

    /** Flush held frames in the given index order (to simulate reordering). */
    flush(order: number[]): void {
        const frames = this.held
        this.held = []
        for (const i of order) this.dispatch(frames[i].to, frames[i].payload)
    }

    /** Tamper the most recently held frame's signature, then flush in order. */
    flushTampered(): void {
        for (const f of this.held) {
            // Corrupt the ciphertext so decrypt fails (cheapest tamper that
            // still drives the transport's error path).
            f.payload.encrypted = {
                ...f.payload.encrypted,
                ciphertext: f.payload.encrypted.ciphertext.slice(0, -4) + "AAAA",
            }
        }
        const frames = this.held
        this.held = []
        for (const f of frames) this.dispatch(f.to, f.payload)
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0))
}

describe("L2PSChannelTransport — E2E with real identities", () => {
    let alice: { demos: Demos; claim: ClaimReference }
    let bob: { demos: Demos; claim: ClaimReference }

    beforeEach(async () => {
        alice = await newConnectedDemos()
        bob = await newConnectedDemos()
    })

    function wire(relay: Relay) {
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
        const aRecv: number[] = []
        const bRecv: number[] = []
        const aErr: Error[] = []
        const bErr: Error[] = []
        const aTx = new L2PSChannelTransport({
            session: aSes,
            peer: relay.endpoint("alice"),
            sharedKey: SUBNET_KEY,
            recipients: ["bob"],
            onMessage: m => aRecv.push(m.sequence),
            onError: e => aErr.push(e),
        })
        const bTx = new L2PSChannelTransport({
            session: bSes,
            peer: relay.endpoint("bob"),
            sharedKey: SUBNET_KEY,
            recipients: ["alice"],
            onMessage: m => bRecv.push(m.sequence),
            onError: e => bErr.push(e),
        })
        return { aSes, bSes, aTx, bTx, aRecv, bRecv, aErr, bErr }
    }

    it("full offer → counter → accept round verifies on both ends", async () => {
        const relay = new Relay()
        const { aSes, bSes, aTx, bTx, aRecv, bRecv, aErr, bErr } = wire(relay)
        await aSes.open()
        await bSes.open()
        aTx.start()
        bTx.start()

        await aTx.send({ type: "offer", body: { price: 100 } }) // seq 1
        await flush()
        await bTx.send({ type: "counter", body: { price: 90 }, repliesTo: 1 }) // seq 2
        await flush()
        await aTx.send({ type: "accept", body: { price: 90 }, repliesTo: 2 }) // seq 3
        await flush()

        // bob received alice's offer(1) + accept(3); alice received bob's counter(2)
        expect(bRecv).toEqual([1, 3])
        expect(aRecv).toEqual([2])
        // Real signature verification passed throughout — no errors.
        expect(aErr).toEqual([])
        expect(bErr).toEqual([])
        // Both transcripts agree on the three messages in sequence.
        expect(aSes.messages().map(m => m.sequence)).toEqual([1, 2, 3])
        expect(bSes.messages().map(m => m.sequence)).toEqual([1, 2, 3])
    })

    it("reorders a burst delivered out of order (offline-queue replay)", async () => {
        const relay = new Relay()
        const { aSes, bSes, aTx, bTx, bRecv, bErr } = wire(relay)
        await aSes.open()
        await bSes.open()
        aTx.start()
        bTx.start()

        // Alice bursts two messages without waiting; the relay holds them.
        relay.hold = true
        await aTx.send({ type: "offer", body: { n: 1 } }) // seq 1
        await aTx.send({ type: "counter", body: { n: 2 } }) // seq 2
        // Deliver REVERSED: seq2 arrives before seq1.
        relay.flush([1, 0])
        await flush()

        // Despite reversed arrival, bob applied them in sequence order.
        expect(bRecv).toEqual([1, 2])
        expect(bErr).toEqual([])
        expect(bSes.messages().map(m => m.sequence)).toEqual([1, 2])
    })

    it("surfaces a tampered frame via onError without advancing", async () => {
        const relay = new Relay()
        const { aSes, bSes, aTx, bTx, bRecv, bErr } = wire(relay)
        await aSes.open()
        await bSes.open()
        aTx.start()
        bTx.start()

        relay.hold = true
        await aTx.send({ type: "offer", body: { n: 1 } }) // seq 1
        relay.flushTampered()
        await flush()

        // Corrupted ciphertext → decrypt fails → onError, nothing applied.
        expect(bRecv).toEqual([])
        expect(bErr.length).toBe(1)
        expect(bSes.messages()).toEqual([])
    })
})
