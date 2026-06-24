import {
    RfqSession,
    type RfqAcceptBody,
    type RfqProposalBody,
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

    aSes = new RfqSession({ me: A, send: mkSend(A, () => bSes) })
    bSes = new RfqSession({ me: B, send: mkSend(B, () => aSes) })
    return { aSes, bSes }
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe("RfqSession — negotiate-rfq state machine", () => {
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
