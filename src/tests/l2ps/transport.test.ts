import {
    L2PSChannelTransport,
    type ChannelSessionLike,
    type IncomingMessagePayload,
    type L2PSMessagingPeerLike,
    type SerializedEncryptedMessage,
} from "@/l2ps/channel/transport"
import type { ChannelMessage, ChannelMessageType } from "@/l2ps/channel"

const CHANNEL = "ch-test-1"
const KEY = new Uint8Array(32).fill(7)

/**
 * Fake session: enforces the same monotonic rule as the real
 * ChannelSession (`sequence` must be strictly greater than the highest
 * seen) and records the order it accepted messages, but without real
 * signatures so the reorder logic can be tested in isolation.
 */
class FakeSession implements ChannelSessionLike {
    readonly channelId = CHANNEL
    highestSeen = 0
    applied: number[] = []
    private outSeq = 0

    async sendOutgoing(opts: {
        type: ChannelMessageType
        body: unknown
    }): Promise<ChannelMessage> {
        const sequence = ++this.highestSeen
        this.outSeq = sequence
        return makeMsg(sequence, opts.type, opts.body)
    }

    async receiveIncoming(msg: ChannelMessage): Promise<void> {
        if (msg.sequence <= this.highestSeen) {
            throw new Error(
                `non-monotonic ${msg.sequence} <= ${this.highestSeen}`,
            )
        }
        this.highestSeen = msg.sequence
        this.applied.push(msg.sequence)
    }
}

/** Fake peer: lets the test capture sends and inject inbound frames. */
class FakePeer implements L2PSMessagingPeerLike {
    sent: { to: string; messageHash: string }[] = []
    private handler: ((p: IncomingMessagePayload) => void) | null = null

    async send(to: string, _e: SerializedEncryptedMessage, messageHash: string) {
        this.sent.push({ to, messageHash })
        return { messageHash, l2psStatus: "submitted" as const }
    }
    onMessage(handler: (p: IncomingMessagePayload) => void): void {
        this.handler = handler
    }
    inject(p: IncomingMessagePayload): void {
        if (!this.handler) throw new Error("no handler registered")
        this.handler(p)
    }
}

function makeMsg(
    sequence: number,
    type: ChannelMessageType = "offer",
    body: unknown = {},
): ChannelMessage {
    return {
        channelId: CHANNEL,
        sequence,
        sender: "demos:0x" + "a".repeat(64),
        sentAt: 1000 + sequence,
        type,
        body,
        signature: { sigVersion: "1", signature: "0xsig" + sequence },
    } as ChannelMessage
}

/**
 * AES-256-GCM encrypt to the SerializedEncryptedMessage wire shape using
 * the same scheme the adapter decrypts with, so an injected frame
 * round-trips. (The adapter's own encrypt() is private; this mirrors it.)
 */
async function encryptEnvelope(
    msg: ChannelMessage,
): Promise<SerializedEncryptedMessage> {
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const key = await crypto.subtle.importKey(
        "raw",
        KEY.buffer as ArrayBuffer,
        "AES-GCM",
        false,
        ["encrypt"],
    )
    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        new TextEncoder().encode(JSON.stringify(msg)),
    )
    return {
        ciphertext: Buffer.from(new Uint8Array(cipher)).toString("base64"),
        nonce: Buffer.from(nonce).toString("base64"),
    }
}

async function inject(
    peer: FakePeer,
    msg: ChannelMessage,
    from = "0xpeer",
): Promise<void> {
    peer.inject({
        from,
        encrypted: await encryptEnvelope(msg),
        messageHash: msg.signature.signature,
    })
}

/** Wait for the adapter's internal drain chain to settle. */
async function flush(): Promise<void> {
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))
}

describe("L2PSChannelTransport — reorder buffer", () => {
    function setup() {
        const session = new FakeSession()
        const peer = new FakePeer()
        const applied: number[] = []
        const transport = new L2PSChannelTransport({
            session,
            peer,
            sharedKey: KEY,
            recipients: ["0xpeer"],
            onMessage: m => applied.push(m.sequence),
        })
        transport.start()
        return { session, peer, transport, applied }
    }

    it("applies in-order arrivals immediately", async () => {
        const { peer, transport, applied } = setup()
        await inject(peer, makeMsg(1))
        await flush()
        await inject(peer, makeMsg(2))
        await flush()
        expect(applied).toEqual([1, 2])
        expect(transport.bufferedCount).toBe(0)
    })

    it("buffers a gap and applies in order once it fills", async () => {
        const { peer, transport, applied } = setup()
        // seq 3 and 2 arrive before 1 (offline-queue replay / reorder)
        await inject(peer, makeMsg(3))
        await flush()
        expect(applied).toEqual([]) // held — gap at 1,2
        expect(transport.bufferedCount).toBe(1)

        await inject(peer, makeMsg(2))
        await flush()
        expect(applied).toEqual([]) // still held — gap at 1
        expect(transport.bufferedCount).toBe(2)

        await inject(peer, makeMsg(1))
        await flush()
        // 1 fills the gap → 1,2,3 drain contiguously, in order
        expect(applied).toEqual([1, 2, 3])
        expect(transport.bufferedCount).toBe(0)
    })

    it("drops duplicates / already-applied sequences", async () => {
        const { peer, applied } = setup()
        await inject(peer, makeMsg(1))
        await flush()
        await inject(peer, makeMsg(1)) // replay
        await flush()
        expect(applied).toEqual([1])
    })

    it("ignores envelopes for a different channel on the same subnet", async () => {
        const { peer, applied } = setup()
        const other = makeMsg(1)
        ;(other as { channelId: string }).channelId = "ch-other"
        await inject(peer, other)
        await flush()
        expect(applied).toEqual([])
    })

    it("interleaves our sends with peer replies on the shared counter", async () => {
        const { peer, transport, applied } = setup()
        // We send seq 1; peer replies seq 2; we send seq 3; peer seq 4.
        await transport.send({ type: "offer", body: {} }) // seq 1 (outgoing)
        await inject(peer, makeMsg(2, "counter"))
        await flush()
        await transport.send({ type: "counter", body: {} }) // seq 3 (outgoing)
        await inject(peer, makeMsg(4, "accept"))
        await flush()
        // Only inbound (2,4) go through onMessage; sends are returned directly.
        expect(applied).toEqual([2, 4])
        expect(peer.sent.length).toBe(2) // one delivery per send to the single recipient
    })
})
