import { Demos } from "@/websdk/demosclass"
import type { ClaimReference } from "@/identity/cci"
import type {
    ChannelMessage,
    ChannelMessageType,
    UnsignedChannelMessage,
} from "./types"
import {
    isSenderInMembers,
    signChannelMessage,
    verifyChannelMessage,
} from "./envelope"
import type { ChannelIdRegistry } from "./channelIdRegistry"
import {
    checkLiveness,
    type LivenessPolicy,
    type LivenessState,
} from "./liveness"

export interface ChannelSessionOpts {
    channelId: string
    members: ClaimReference[]
    /** This party's primary claim — must be in `members`. */
    me: ClaimReference
    demos: Demos
    /**
     * Optional CH-6 enforcement. If provided, `open()` registers the
     * channelId here and throws on reuse.
     */
    channelIdRegistry?: ChannelIdRegistry
    /**
     * Clock for CH-4 liveness. Injectable so delivery bounds are testable
     * without waiting on wall time. Defaults to `Date.now`.
     */
    now?: () => number
}

/**
 * Per-channel session — owns the monotonic sequence counter and applies
 * the four invariants from §8.3.3 / §8.12 on every message:
 *
 *   1. signature verifies under sender's CCI key
 *   2. sender ∈ members (CH-1)
 *   3. sequence is monotonic per channel (anti-replay)
 *   4. channelId matches the session's channelId
 *
 * A single counter is shared across senders, as the brief specifies
 * (`sequence: number  // monotonic per channel, starts at 1`). Outgoing
 * messages get `current + 1`; incoming messages must use a sequence
 * strictly greater than every value already seen.
 */
export class ChannelSession {
    readonly channelId: string
    readonly members: ReadonlyArray<ClaimReference>
    readonly me: ClaimReference
    private readonly demos: Demos
    private readonly registry: ChannelIdRegistry | undefined
    private opened = false
    private highestSeen = 0
    private readonly transcript: ChannelMessage[] = []
    private readonly clock: () => number
    /** Local times — CH-4 is measured on what THIS member observed, never on
     * a peer's self-reported `sentAt`. */
    private openedAt = 0
    private lastActivityAt = 0

    constructor(opts: ChannelSessionOpts) {
        if (!opts.channelId) throw new Error("ChannelSession: channelId required")
        if (!opts.members?.length)
            throw new Error("ChannelSession: members required")
        if (!opts.members.includes(opts.me))
            throw new Error(
                `ChannelSession: me (${opts.me}) is not in members`,
            )

        this.channelId = opts.channelId
        this.members = [...opts.members]
        this.me = opts.me
        this.demos = opts.demos
        this.registry = opts.channelIdRegistry
        this.clock = opts.now ?? (() => Date.now())
    }

    /**
     * Register the channelId (CH-6) and prepare for messaging. Idempotent
     * within a session — calling twice throws via the registry.
     */
    async open(): Promise<void> {
        if (this.opened)
            throw new Error("ChannelSession: already opened")
        if (this.registry) await this.registry.register(this.channelId)
        this.opened = true
        this.openedAt = this.clock()
        this.lastActivityAt = this.openedAt
    }

    /**
     * CH-4 — is the channel still within its delivery bounds, as observed by
     * THIS member? Returns a state rather than throwing: a counterparty going
     * quiet is an expected outcome, and the member reacts by aborting the
     * negotiation (CH-5), which is a policy decision this layer doesn't make.
     */
    liveness(policy?: LivenessPolicy, now?: number): LivenessState {
        this.assertOpened()
        return checkLiveness({
            openedAt: this.openedAt,
            lastActivityAt: this.lastActivityAt,
            policy,
            now: now ?? this.clock(),
        })
    }

    /**
     * Build, sign, append-to-local-transcript, and return the next
     * outgoing `ChannelMessage`. Sequence is `highestSeen + 1` so it is
     * monotonic across both directions.
     */
    async sendOutgoing(opts: {
        type: ChannelMessageType
        body: unknown
        sentAt?: number
        repliesTo?: number
    }): Promise<ChannelMessage> {
        this.assertOpened()
        // Reserve the sequence slot SYNCHRONOUSLY before any await — two
        // concurrent sendOutgoing() calls would otherwise read the same
        // `highestSeen`, sign two messages with identical sequence
        // numbers, and silently violate the anti-replay invariant on the
        // receiver side.
        const sequence = ++this.highestSeen
        const unsigned: UnsignedChannelMessage = {
            channelId: this.channelId,
            sequence,
            sender: this.me,
            sentAt: opts.sentAt ?? Date.now(),
            type: opts.type,
            body: opts.body,
            ...(opts.repliesTo !== undefined && {
                refs: { repliesTo: opts.repliesTo },
            }),
        }
        const signed = await signChannelMessage(unsigned, this.demos)
        this.transcript.push(signed)
        this.lastActivityAt = this.clock()
        return signed
    }

    /**
     * Validate an incoming `ChannelMessage`. Throws with a precise reason
     * on any failure — caller should treat throw as channel-fatal per
     * §8.12 (a single tampered message invalidates the session's record).
     */
    async receiveIncoming(msg: ChannelMessage): Promise<void> {
        this.assertOpened()
        if (msg.channelId !== this.channelId)
            throw new Error(
                `ChannelSession: channelId mismatch (expected ${this.channelId}, got ${msg.channelId})`,
            )
        if (!isSenderInMembers(msg, this.members))
            throw new Error(
                `ChannelSession: sender "${msg.sender}" not in members (CH-1)`,
            )
        if (!Number.isInteger(msg.sequence) || msg.sequence < 1)
            throw new Error(
                `ChannelSession: invalid sequence ${msg.sequence}`,
            )
        if (msg.sequence <= this.highestSeen)
            throw new Error(
                `ChannelSession: non-monotonic sequence ${msg.sequence} (highest seen ${this.highestSeen})`,
            )
        if (!verifyChannelMessage(msg))
            throw new Error(
                "ChannelSession: signature verification failed",
            )
        this.highestSeen = msg.sequence
        this.transcript.push(msg)
        this.lastActivityAt = this.clock()
    }

    /** Read-only snapshot of all messages this session has signed or accepted. */
    messages(): ReadonlyArray<ChannelMessage> {
        return this.transcript
    }

    private assertOpened(): void {
        if (!this.opened)
            throw new Error(
                "ChannelSession: call open() before sending or receiving",
            )
    }
}
