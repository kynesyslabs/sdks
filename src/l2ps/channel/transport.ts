/**
 * SR-4 WI-A — Channel-over-L2PS transport adapter.
 *
 * The DACS channel layer (`ChannelSession`) is transport-agnostic: it
 * produces signed `ChannelMessage` envelopes and verifies incoming ones,
 * but does not move bytes. The L2PS instant-messaging layer
 * (`L2PSMessagingPeer`) moves encrypted bytes between subnet members but
 * knows nothing about channel envelopes. This adapter bridges the two:
 * it serialises + encrypts an outgoing envelope onto the messaging
 * transport, and on the receive side decrypts, deserialises, and feeds
 * envelopes into the session **in strict sequence order**.
 *
 * Why a reorder buffer is mandatory:
 * `ChannelSession.receiveIncoming` accepts any sequence strictly greater
 * than the highest it has seen and then advances its counter to that
 * value — so a *gap* (seq N+2 arriving before N+1) is not rejected, it
 * permanently skips the missing messages. The L2PS transport delivers by
 * timestamp and replays an offline queue, so out-of-order arrival is
 * normal. This adapter therefore only hands the session the next
 * contiguous sequence and buffers anything ahead of the gap until it
 * fills.
 *
 * Scope / assumptions:
 * - The shared per-channel sequence counter assumes turn-based messaging
 *   (DACS negotiation is offer → counter → accept; a party waits for the
 *   counter before replying). Two parties emitting the same sequence
 *   concurrently is out of scope for SR-4 v1; such a colliding inbound
 *   message (seq <= already-applied) is dropped as a duplicate.
 * - Membership is the channel's `members`; the transport sends to every
 *   member except self. Confidentiality is the subnet AES key (only
 *   members hold it) — CH-2.
 */

import type { ChannelMessage, ChannelMessageType } from "./types"

/**
 * Max number of sequences a buffered inbound frame may sit ahead of the
 * current contiguous point before it is dropped, bounding reorder-buffer
 * memory. Turn-based negotiation never legitimately exceeds this.
 */
const MAX_REORDER_AHEAD = 256

/**
 * Minimal surface of `ChannelSession` the adapter depends on. Declared
 * structurally so tests can inject a fake without real signing keys.
 */
export interface ChannelSessionLike {
    readonly channelId: string
    sendOutgoing(opts: {
        type: ChannelMessageType
        body: unknown
        sentAt?: number
        repliesTo?: number
    }): Promise<ChannelMessage>
    receiveIncoming(msg: ChannelMessage): Promise<void>
}

/** Wire shape the L2PS messaging transport carries (ciphertext + nonce, base64). */
export interface SerializedEncryptedMessage {
    ciphertext: string
    nonce: string
    ephemeralKey?: string
}

/** Incoming payload the messaging peer hands to an onMessage handler. */
export interface IncomingMessagePayload {
    from: string
    encrypted: SerializedEncryptedMessage
    messageHash: string
    offline?: boolean
}

/**
 * Minimal surface of `L2PSMessagingPeer` the adapter depends on.
 * Declared structurally for the same reason as `ChannelSessionLike`.
 */
export interface L2PSMessagingPeerLike {
    send(
        to: string,
        encrypted: SerializedEncryptedMessage,
        messageHash: string,
    ): Promise<unknown>
    onMessage(handler: (payload: IncomingMessagePayload) => void): void
}

export interface L2PSChannelTransportOpts {
    session: ChannelSessionLike
    peer: L2PSMessagingPeerLike
    /** Subnet AES-256 key (raw 32 bytes) — only members hold it (CH-2). */
    sharedKey: Uint8Array
    /**
     * Recipient public keys to deliver to (every channel member except
     * self), in the format the messaging peer routes on.
     */
    recipients: string[]
    /** Called with each envelope once it has been applied in order. */
    onMessage?: (msg: ChannelMessage) => void
    /** Called on a decrypt / parse / verification failure. */
    onError?: (err: Error) => void
}

export class L2PSChannelTransport {
    private readonly session: ChannelSessionLike
    private readonly peer: L2PSMessagingPeerLike
    private readonly sharedKey: Uint8Array
    private readonly recipients: string[]
    private readonly onMessage?: (msg: ChannelMessage) => void
    private readonly onError?: (err: Error) => void

    /** Sequences seen ahead of the gap, awaiting contiguous application. */
    private readonly buffer = new Map<number, ChannelMessage>()
    /** Highest contiguous sequence applied locally (sent or received). */
    private appliedSeq = 0
    /** Serialises drain() so concurrent inbound frames can't interleave. */
    private draining: Promise<void> = Promise.resolve()
    private started = false

    /**
     * An outgoing envelope that has been minted (sequence reserved, signed,
     * encrypted) but not yet delivered to every recipient. Retained so a
     * failed send can be re-sent byte-identically instead of burning the
     * sequence; `deliveredTo` tracks who already has it so a retry only
     * re-sends the ones still missing.
     */
    private pending: {
        signed: ChannelMessage
        encrypted: SerializedEncryptedMessage
        messageHash: string
        deliveredTo: Set<string>
    } | null = null

    constructor(opts: L2PSChannelTransportOpts) {
        this.session = opts.session
        this.peer = opts.peer
        this.sharedKey = opts.sharedKey
        this.recipients = opts.recipients
        this.onMessage = opts.onMessage
        this.onError = opts.onError
    }

    /** Wire the peer's inbound handler. Call once. */
    start(): void {
        if (this.started) throw new Error("L2PSChannelTransport: already started")
        this.started = true
        this.peer.onMessage(payload => {
            // Chain onto `draining` so frames are processed one at a time
            // in arrival order; each appends to the buffer then drains.
            this.draining = this.draining
                .then(() => this.ingest(payload))
                .catch(err => this.onError?.(err as Error))
        })
    }

    /**
     * Build + sign the next outgoing envelope via the session, encrypt
     * it under the subnet key, and deliver to every recipient.
     */
    async send(opts: {
        type: ChannelMessageType
        body: unknown
        repliesTo?: number
    }): Promise<ChannelMessage> {
        // A previously-minted envelope that has not been fully delivered
        // still owns its sequence number. Minting a new one now would skip
        // ahead and strand peers behind a permanent reorder gap, so the
        // caller must finish delivering it first via resendPending().
        if (this.pending) {
            throw new Error(
                "L2PSChannelTransport: a previous message is still awaiting " +
                    "delivery — call resendPending() before sending a new one",
            )
        }

        // Mint + sign + encrypt exactly once. The signed envelope and its
        // ciphertext are retained so a failed delivery can be re-sent
        // byte-identically (same sequence, signature and nonce) rather than
        // burning the sequence and minting a divergent message that leaves
        // the receiver waiting on a number that will never arrive.
        const signed = await this.session.sendOutgoing(opts)
        const encrypted = await this.encrypt(JSON.stringify(signed))
        this.pending = {
            signed,
            encrypted,
            messageHash: signed.signature.signature, // unique per signed envelope
            deliveredTo: new Set<string>(),
        }

        return this.deliverPending()
    }

    /**
     * Re-deliver the envelope that failed mid-send, re-using the exact same
     * signed bytes, sequence and ciphertext — so recipients that already have
     * it dedupe it (seq <= applied) and the node sees the same messageHash.
     * Returns null when nothing is pending. On a repeat failure it throws and
     * leaves the envelope pending for a further retry.
     */
    async resendPending(): Promise<ChannelMessage | null> {
        if (!this.pending) return null
        return this.deliverPending()
    }

    /** True while an outgoing envelope is minted but not fully delivered. */
    get hasPendingSend(): boolean {
        return this.pending !== null
    }

    /**
     * Deliver the pending envelope to every recipient that has not yet
     * received it. On full success the sequence is committed locally and the
     * pending slot cleared; on failure the slot is kept (recording who already
     * got it) so the next resend only re-tries the ones still missing.
     */
    private async deliverPending(): Promise<ChannelMessage> {
        const pending = this.pending
        if (!pending) {
            throw new Error(
                "L2PSChannelTransport: no pending envelope to deliver",
            )
        }
        for (const to of this.recipients) {
            if (pending.deliveredTo.has(to)) continue
            await this.peer.send(to, pending.encrypted, pending.messageHash)
            pending.deliveredTo.add(to)
        }
        // Fully delivered: advance the shared per-channel counter so we expect
        // the peer's reply at appliedSeq + 1, and clear the slot.
        if (pending.signed.sequence > this.appliedSeq) {
            this.appliedSeq = pending.signed.sequence
        }
        this.pending = null
        return pending.signed
    }

    private async ingest(payload: IncomingMessagePayload): Promise<void> {
        let msg: ChannelMessage
        try {
            const json = await this.decrypt(payload.encrypted)
            msg = JSON.parse(json) as ChannelMessage
        } catch (e) {
            throw new Error(
                `L2PSChannelTransport: failed to decrypt/parse inbound frame from ${payload.from}: ${
                    (e as Error).message
                }`,
            )
        }

        // Ignore traffic for other channels sharing the same subnet.
        if (msg.channelId !== this.session.channelId) return
        // Duplicate / already-applied (or a colliding concurrent send): drop.
        if (msg.sequence <= this.appliedSeq) return
        // Bound the reorder window: a member could otherwise stream many
        // validly-encrypted frames at far-future sequences without ever
        // filling the gap, growing `buffer` without limit. Drop anything
        // beyond MAX_REORDER_AHEAD of the current contiguous point — a
        // legitimate turn-based negotiation never runs that far ahead, and
        // a dropped frame is re-deliverable (the offline queue replays it
        // once the gap closes and appliedSeq advances).
        if (msg.sequence > this.appliedSeq + MAX_REORDER_AHEAD) {
            this.onError?.(
                new Error(
                    `L2PSChannelTransport: dropping seq ${msg.sequence} — ` +
                        `more than ${MAX_REORDER_AHEAD} ahead of applied ${this.appliedSeq}`,
                ),
            )
            return
        }
        // Buffer; a later sequence with the same value would be a protocol
        // error — keep the first seen.
        if (!this.buffer.has(msg.sequence)) this.buffer.set(msg.sequence, msg)

        await this.drain()
    }

    /** Apply every buffered message that is now contiguous with appliedSeq. */
    private async drain(): Promise<void> {
        // Sequence counter is shared across both directions, so the next
        // expected inbound is appliedSeq + 1.
        let next = this.buffer.get(this.appliedSeq + 1)
        while (next) {
            this.buffer.delete(next.sequence)
            // Throws on tamper (bad signature, wrong sender, channelId
            // mismatch) — propagate as channel-fatal per §8.12.
            await this.session.receiveIncoming(next)
            this.appliedSeq = next.sequence
            this.onMessage?.(next)
            next = this.buffer.get(this.appliedSeq + 1)
        }
    }

    /** Count of out-of-order messages currently held awaiting the gap. */
    get bufferedCount(): number {
        return this.buffer.size
    }

    // ── AES-256-GCM (Web Crypto) — matches the messaging wire format:
    //    ciphertext (with auth tag) + 12-byte nonce, both base64. ──

    private async encrypt(plaintext: string): Promise<SerializedEncryptedMessage> {
        const nonce = crypto.getRandomValues(new Uint8Array(12))
        const key = await crypto.subtle.importKey(
            "raw",
            keyBytes(this.sharedKey),
            "AES-GCM",
            false,
            ["encrypt"],
        )
        const cipher = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            key,
            new TextEncoder().encode(plaintext),
        )
        return {
            ciphertext: bytesToBase64(new Uint8Array(cipher)),
            nonce: bytesToBase64(nonce),
        }
    }

    private async decrypt(enc: SerializedEncryptedMessage): Promise<string> {
        const key = await crypto.subtle.importKey(
            "raw",
            keyBytes(this.sharedKey),
            "AES-GCM",
            false,
            ["decrypt"],
        )
        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBytes(enc.nonce) as BufferSource },
            key,
            base64ToBytes(enc.ciphertext) as BufferSource,
        )
        return new TextDecoder().decode(plain)
    }
}

/**
 * Return a standalone `ArrayBuffer` holding exactly the bytes of `view`.
 * `view.buffer` exposes the whole backing buffer, which for a `subarray`
 * (e.g. a 32-byte key sliced out of a larger buffer) is longer than the
 * view — Web Crypto would then see the wrong length / wrong bytes and
 * reject or mis-key the AES import. Copying the exact `[byteOffset,
 * byteOffset+byteLength)` window guarantees the key import sees only the
 * intended bytes.
 */
function keyBytes(view: Uint8Array): ArrayBuffer {
    return view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
    ) as ArrayBuffer
}

function bytesToBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64")
}

function base64ToBytes(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"))
}
