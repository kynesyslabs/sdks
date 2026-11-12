import {
    RfqSession,
    type RfqAcceptBody,
    type RfqProposalBody,
    type RfqSessionSnapshot,
} from "@/l2ps/channel/negotiate"
import type { ChannelMessage, ChannelMessageType } from "@/l2ps/channel"
import type { ClaimReference } from "@/identity/cci"

const A = ("demos:0x" + "a".repeat(64)) as ClaimReference
const B = ("demos:0x" + "b".repeat(64)) as ClaimReference

/**
 * A two-party RFQ harness: each side has an RfqSession whose `send`
 * callback mints a ChannelMessage (monotonic shared sequence) and
 * delivers it to the other side's `onIncoming`. No transport / crypto —
 * the channel layer's verification is out of scope here; this tests the
 * protocol state machine.
 */
function harness() {
    let seq = 0
    let aSes!: RfqSession
    let bSes!: RfqSession

    const mkSend =
        (me: string, peer: () => RfqSession) =>
        async (opts: {
            type: ChannelMessageType
            body: unknown
            repliesTo?: number
        }): Promise<ChannelMessage> => {
            const msg = {
                channelId: "ch",
                sequence: ++seq,
                sender: me,
                sentAt: 1000 + seq,
                type: opts.type,
                body: opts.body,
                ...(opts.repliesTo !== undefined && {
                    refs: { repliesTo: opts.repliesTo },
                }),
                signature: { sigVersion: "1", signature: "0xsig" + seq },
            } as ChannelMessage
            // Deliver to the counterparty after the local state settles.
            queueMicrotask(() => peer().onIncoming(msg))
            return msg
        }

    // Deliberately use the original public constructor shape: channelId and
    // members remain optional for source compatibility.
    aSes = new RfqSession({ me: A, send: mkSend(A, () => bSes) })
    bSes = new RfqSession({ me: B, send: mkSend(B, () => aSes) })
    return { aSes, bSes }
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe("RfqSession — negotiate-rfq state machine", () => {
    it("requires a unique exact membership containing this party", () => {
        const send = async () => { throw new Error("unused") }
        expect(() => new RfqSession({
            channelId: "ch",
            members: [A, A],
            me: A,
            send,
        })).toThrow(/duplicate RFQ session member/)
        expect(() => new RfqSession({
            channelId: "ch",
            members: [B],
            me: A,
            send,
        })).toThrow(/not in members/)
    })

    it("rejects exact duplicates separated by locale-equivalent identities", () => {
        const composed = "x:\u00e9" as ClaimReference
        const decomposed = "x:e\u0301" as ClaimReference
        expect(composed.localeCompare(decomposed)).toBe(0)

        expect(() => new RfqSession({
            channelId: "ch",
            members: [composed, decomposed, composed],
            me: composed,
            send: async () => { throw new Error("unused") },
        })).toThrow(/duplicate RFQ session member/)
    })

    it("offer → counter → accept settles agreedTerms on both sides", async () => {
        const { aSes, bSes } = harness()

        await aSes.offer({ price: 100 })
        await tick()
        expect(bSes.standingProposal?.terms).toEqual({ price: 100 })

        await bSes.counter({ price: 90 })
        await tick()
        expect(aSes.standingProposal?.terms).toEqual({ price: 90 })

        await aSes.accept()
        await tick()

        expect(aSes.state).toBe("accepted")
        expect(bSes.state).toBe("accepted")
        expect(aSes.outcome().agreedTerms).toEqual({ price: 90 })
        expect(bSes.outcome().agreedTerms).toEqual({ price: 90 })
        // accept referenced bob's counter (sequence 2)
        expect(aSes.outcome().acceptedSequence).toBe(2)
        expect(bSes.outcome().acceptedSequence).toBe(2)
    })

    it("reject terminates both sides", async () => {
        const { aSes, bSes } = harness()
        await aSes.offer({ price: 100 })
        await tick()
        await bSes.reject("too high")
        await tick()
        expect(bSes.state).toBe("rejected")
        expect(aSes.state).toBe("rejected")
        expect(aSes.outcome().reason).toBe("too high")
    })

    it("accept resolves the terms of the exact proposal it references", async () => {
        const { aSes, bSes } = harness()
        await aSes.offer({ price: 100 }) // seq 1
        await tick()
        await bSes.counter({ price: 80 }) // seq 2
        await tick()
        await aSes.counter({ price: 90 }) // seq 3 (standing)
        await tick()
        await bSes.accept() // accepts seq 3
        await tick()
        expect(aSes.outcome().agreedTerms).toEqual({ price: 90 })
        expect(aSes.outcome().acceptedSequence).toBe(3)
    })

    it("rejects illegal transitions", async () => {
        const { aSes } = harness()
        // accept with nothing on the table
        await expect(aSes.accept()).rejects.toThrow(/nothing to accept/)
        // counter with nothing on the table
        await expect(aSes.counter({ x: 1 })).rejects.toThrow(/nothing to counter/)

        await aSes.offer({ price: 100 })
        // second offer once one stands
        await expect(aSes.offer({ price: 1 })).rejects.toThrow(
            /already stands/,
        )
    })

    it("refuses any action after a terminal state", async () => {
        const { aSes, bSes } = harness()
        await aSes.offer({ price: 100 })
        await tick()
        // The counterparty (B) accepts A's offer — reaching the terminal
        // state legitimately (a party cannot accept its own proposal).
        await bSes.accept()
        await tick()
        await expect(aSes.counter({ price: 1 })).rejects.toThrow(/accepted/)
        await expect(aSes.reject()).rejects.toThrow(/accepted/)
        await expect(bSes.offer({ price: 1 })).rejects.toThrow(/accepted/)
    })

    it("throws if an inbound accept references an unknown proposal", () => {
        const { aSes } = harness()
        const bogus = {
            channelId: "ch",
            sequence: 9,
            sender: B,
            sentAt: 9,
            type: "accept" as ChannelMessageType,
            body: { acceptedSequence: 42 } as RfqAcceptBody,
            signature: { sigVersion: "1", signature: "0xsig9" },
        } as ChannelMessage
        expect(() => aSes.onIncoming(bogus)).toThrow(/unknown proposal/)
    })

    it("refuses to accept your own standing proposal", async () => {
        const { aSes } = harness()
        await aSes.offer({ price: 100 })
        await tick()
        // A's own offer stands locally; A must not accept it.
        await expect(aSes.accept()).rejects.toThrow(/your own proposal/)
    })

    it("rejects an inbound counter before any offer stands", () => {
        const { aSes } = harness()
        const counter = {
            channelId: "ch",
            sequence: 1,
            sender: B,
            sentAt: 1,
            type: "counter" as ChannelMessageType,
            body: { terms: { price: 1 } } as RfqProposalBody,
            signature: { sigVersion: "1", signature: "0xsig1" },
        } as ChannelMessage
        expect(() => aSes.onIncoming(counter)).toThrow(/no standing offer to counter/)
    })

    it("rejects a second inbound offer once a proposal stands", async () => {
        const { aSes } = harness()
        await aSes.offer({ price: 100 }) // A's offer stands (seq 1)
        await tick()
        const secondOffer = {
            channelId: "ch",
            sequence: 2,
            sender: B,
            sentAt: 2,
            type: "offer" as ChannelMessageType,
            body: { terms: { price: 5 } } as RfqProposalBody,
            signature: { sigVersion: "1", signature: "0xsig2" },
        } as ChannelMessage
        expect(() => aSes.onIncoming(secondOffer)).toThrow(/already stands/)
    })

    it("rejects an inbound accept that references a stale (superseded) proposal", async () => {
        const { aSes, bSes } = harness()
        await aSes.offer({ price: 100 }) // seq 1
        await tick()
        await bSes.counter({ price: 80 }) // seq 2 — supersedes seq 1
        await tick()
        // A receives an accept that points at the now-stale seq 1.
        const staleAccept = {
            channelId: "ch",
            sequence: 3,
            sender: B,
            sentAt: 3,
            type: "accept" as ChannelMessageType,
            body: { acceptedSequence: 1 } as RfqAcceptBody,
            signature: { sigVersion: "1", signature: "0xsig3" },
        } as ChannelMessage
        expect(() => aSes.onIncoming(staleAccept)).toThrow(/stale proposal/)
    })

    it("carries impl-defined terms opaquely (offer body shape)", async () => {
        const { aSes, bSes } = harness()
        const terms = { sku: "X", qty: 3, note: "rush" }
        const msg = await aSes.offer(terms)
        expect((msg.body as RfqProposalBody).terms).toEqual(terms)
        await tick()
        expect(bSes.standingProposal?.terms).toEqual(terms)
    })
})

describe("RfqSession — restart recovery (checkpoint/restore/close)", () => {
    const offerFromA = (
        seq = 1,
        terms: unknown = { sku: "X", qty: 2 },
    ): ChannelMessage =>
        ({
            channelId: "ch",
            sequence: seq,
            sender: A,
            sentAt: 1000 + seq,
            type: "offer",
            body: { terms },
            signature: { sigVersion: "1", signature: "0xsig" + seq },
        }) as ChannelMessage

    // A `send` that records what it was asked to emit, minting a plausible
    // outbound envelope on `me`'s behalf (the channel layer is out of scope).
    const recordingSend =
        (me: ClaimReference, seqStart = 100, into: ChannelMessage[] = []) =>
        async (opts: {
            type: ChannelMessageType
            body: unknown
            repliesTo?: number
        }): Promise<ChannelMessage> => {
            const msg = {
                channelId: "ch",
                sequence: ++seqStart,
                sender: me,
                sentAt: seqStart,
                type: opts.type,
                body: opts.body,
                ...(opts.repliesTo !== undefined && {
                    refs: { repliesTo: opts.repliesTo },
                }),
                signature: { sigVersion: "1", signature: "0xout" + seqStart },
            } as ChannelMessage
            into.push(msg)
            return msg
        }

    it("restores the standing proposal and can still accept after a restart", async () => {
        const b1 = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: B,
            send: async () => {
                throw new Error("no send expected before restart")
            },
        })
        b1.onIncoming(offerFromA(1))
        expect(b1.standingProposal?.sequence).toBe(1)

        const snap = b1.checkpoint()
        // Persist-safe: the snapshot survives a JSON round-trip unchanged.
        expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)

        const b2 = RfqSession.restore(snap, { send: recordingSend(B) })
        expect(b2.state).toBe("open")
        expect(b2.standingProposal?.sequence).toBe(1)

        const accept = await b2.accept()
        expect(accept.type).toBe("accept")
        expect((accept.body as RfqAcceptBody).acceptedSequence).toBe(1)
        expect(b2.state).toBe("accepted")
        expect(b2.outcome().agreedTerms).toEqual({ sku: "X", qty: 2 })
    })

    it("a restored terminal negotiation stays terminal and cannot be re-driven", async () => {
        const a1 = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: A,
            send: recordingSend(A),
        })
        await a1.offer({ x: 1 })
        await a1.reject("done")
        expect(a1.state).toBe("rejected")

        const a2 = RfqSession.restore(a1.checkpoint(), { send: recordingSend(A) })
        expect(a2.state).toBe("rejected")
        await expect(a2.offer({ x: 2 })).rejects.toThrow(
            /negotiation is rejected/,
        )
    })

    it("refuses a checkpoint while a send is in flight (no reused sequence on restore)", async () => {
        let release!: () => void
        const gate = new Promise<void>(resolve => {
            release = resolve
        })
        const out: ChannelMessage[] = []
        let seq = 100
        const a = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: A,
            send: async opts => {
                await gate // stay pending until released
                const msg = {
                    channelId: "ch",
                    sequence: ++seq,
                    sender: A,
                    sentAt: seq,
                    type: opts.type,
                    body: opts.body,
                    signature: { sigVersion: "1", signature: "0xout" + seq },
                } as ChannelMessage
                out.push(msg)
                return msg
            },
        })

        const pending = a.offer({ x: 1 }) // send is awaiting the gate
        // The negotiation hasn't settled locally but the message is on its way,
        // so a checkpoint now would be non-final — it must refuse.
        expect(() => a.checkpoint()).toThrow(/send is in flight/)

        release()
        await pending
        // Once the send settles, a checkpoint is allowed and is final.
        expect(() => a.checkpoint()).not.toThrow()
        expect(a.standingProposal?.sequence).toBe(101)
    })

    it("close() blocks further actions and ignores inbound traffic", async () => {
        const b = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: B,
            send: recordingSend(B),
        })
        b.close()
        await expect(b.offer({ x: 1 })).rejects.toThrow(/session is closed/)
        // Inbound is ignored after close — no throw, no state change.
        b.onIncoming(offerFromA(1))
        expect(b.standingProposal).toBeNull()
        expect(b.state).toBe("open")
    })

    it("restores a closed negotiation as closed, not re-opened", async () => {
        const b = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: B,
            send: recordingSend(B),
        })
        b.close()
        const snap = b.checkpoint()
        expect(snap.closed).toBe(true)

        // A crash right after close() must not re-open the negotiation: the
        // restored session still refuses actions and still ignores traffic.
        const b2 = RfqSession.restore(snap, { send: recordingSend(B) })
        await expect(b2.offer({ x: 1 })).rejects.toThrow(/session is closed/)
        b2.onIncoming(offerFromA(1))
        expect(b2.standingProposal).toBeNull()
    })

    it("persists a write-ahead pending marker before a send and restores closed from it", async () => {
        const snapshots: RfqSessionSnapshot[] = []
        const b = new RfqSession({
            channelId: "ch",
            members: [A, B],
            me: B,
            send: recordingSend(B),
            persist: s => {
                snapshots.push(JSON.parse(JSON.stringify(s)))
            },
        })
        await b.offer({ x: 1 })

        // The write-ahead persist fired a snapshot with a `pending` marker
        // BEFORE the message left, then a settled snapshot after.
        const pendingSnap = snapshots.find(s => s.pending !== undefined)
        expect(pendingSnap?.pending?.type).toBe("offer")
        expect(snapshots[snapshots.length - 1]!.pending).toBeUndefined()

        // Restoring from the pending snapshot (a crash mid-send) yields a closed
        // session that cannot be re-driven.
        const b2 = RfqSession.restore(pendingSnap!, { send: recordingSend(B) })
        await expect(b2.counter({ x: 2 })).rejects.toThrow(/session is closed/)
        b2.onIncoming(offerFromA(9))
        expect(b2.standingProposal).toBeNull()
    })

    it("refuses a restore with an invalid state or a mismatched outcome", () => {
        expect(() =>
            RfqSession.restore(
                { me: B, state: "bogus", standing: null, proposals: [], outcome: { state: "bogus" } } as unknown as RfqSessionSnapshot,
                { send: recordingSend(B) },
            ),
        ).toThrow(/invalid state/)
        expect(() =>
            RfqSession.restore(
                { me: B, state: "accepted", standing: null, proposals: [], outcome: { state: "open" } } as RfqSessionSnapshot,
                { send: recordingSend(B) },
            ),
        ).toThrow(/does not match/)
    })

    it("refuses a restore whose standing proposal is not in the proposal list", () => {
        const standing = { channelId: "ch", messageHash: "h", sequence: 5, sender: A, terms: {} }
        expect(() =>
            RfqSession.restore(
                { me: B, state: "open", standing, proposals: [], outcome: { state: "open" } } as unknown as RfqSessionSnapshot,
                { send: recordingSend(B) },
            ),
        ).toThrow(/not in the proposal list/)
    })
})
