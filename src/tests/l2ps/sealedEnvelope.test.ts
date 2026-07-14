import {
    SealedEnvelopeSession,
    commitmentHex,
    type RevealedBid,
    type SealedCommitBody,
} from "@/l2ps/channel/sealedEnvelope"
import type { ChannelMessage, ChannelMessageType } from "@/l2ps/channel"
import type { ClaimReference } from "@/identity/cci"

const A = ("demos:0x" + "a".repeat(64)) as ClaimReference
const B = ("demos:0x" + "b".repeat(64)) as ClaimReference
const C = ("demos:0x" + "c".repeat(64)) as ClaimReference

/** Highest-price-wins comparator for the tests that pick a winner. */
const byPrice = (a: RevealedBid, b: RevealedBid): number =>
    (a.bid as { price: number }).price - (b.bid as { price: number }).price

/**
 * An N-party sealed-envelope harness. Each session's `send` mints a
 * ChannelMessage on a shared monotonic sequence and delivers it to every
 * *other* session's `onIncoming` — no transport / crypto, so this exercises the
 * protocol state machine, not the channel layer's verification.
 */
function harness(
    participants: ClaimReference[],
    opts?: Partial<{ compareBids: (a: RevealedBid, b: RevealedBid) => number }>,
) {
    let seq = 0
    const sessions = new Map<ClaimReference, SealedEnvelopeSession>()

    const mkSend =
        (me: ClaimReference) =>
        async (o: {
            type: ChannelMessageType
            body: unknown
            repliesTo?: number
        }): Promise<ChannelMessage> => {
            const msg = {
                channelId: "ch",
                sequence: ++seq,
                sender: me,
                sentAt: 1000 + seq,
                type: o.type,
                body: o.body,
                ...(o.repliesTo !== undefined && { refs: { repliesTo: o.repliesTo } }),
                signature: { sigVersion: "1", signature: "0xsig" + seq },
            } as ChannelMessage
            queueMicrotask(() => {
                for (const [claim, s] of sessions)
                    if (claim !== me) s.onIncoming(msg)
            })
            return msg
        }

    for (const p of participants)
        sessions.set(
            p,
            new SealedEnvelopeSession({
                me: p,
                participants,
                send: mkSend(p),
                compareBids: opts?.compareBids,
            }),
        )

    // A raw sender for crafting adversarial (unsigned) messages by hand.
    const raw = (
        sender: ClaimReference,
        type: ChannelMessageType,
        body: unknown,
    ): ChannelMessage =>
        ({
            channelId: "ch",
            sequence: ++seq,
            sender,
            sentAt: 1000 + seq,
            type,
            body,
            signature: { sigVersion: "1", signature: "0xraw" + seq },
        }) as ChannelMessage

    return { get: (c: ClaimReference) => sessions.get(c)!, raw }
}

const tick = () => new Promise(r => setTimeout(r, 0))

describe("commitmentHex", () => {
    it("is deterministic in (bid, salt) and hiding across salts", () => {
        expect(commitmentHex({ price: 100 }, "aa")).toBe(commitmentHex({ price: 100 }, "aa"))
        expect(commitmentHex({ price: 100 }, "aa")).not.toBe(commitmentHex({ price: 100 }, "bb"))
        expect(commitmentHex({ price: 100 }, "aa")).not.toBe(commitmentHex({ price: 101 }, "aa"))
        expect(commitmentHex({ price: 100 }, "aa")).toMatch(/^[0-9a-f]{64}$/)
    })
})

describe("SealedEnvelopeSession — happy path", () => {
    it("commit → auto reveal-phase → reveal → auto close, winner is the top bid", async () => {
        const h = harness([A, B], { compareBids: byPrice })

        await h.get(A).commit({ price: 90 })
        await h.get(B).commit({ price: 100 })
        await tick()

        // Both crossed into the reveal phase only after every bid was sealed.
        expect(h.get(A).state).toBe("reveal")
        expect(h.get(B).state).toBe("reveal")

        await h.get(A).reveal()
        await h.get(B).reveal()
        await tick()

        for (const who of [A, B]) {
            const o = h.get(who).outcome()
            expect(o.state).toBe("closed")
            expect(o.winner).toBe(B)
            expect(o.winningBid).toEqual({ price: 100 })
            expect(o.disqualified).toEqual([])
            expect(o.reveals).toHaveLength(2)
        }
    })

    it("keeps bids hidden until reveal — the commit carries only a hash", async () => {
        const h = harness([A, B])
        await h.get(A).commit({ price: 90 })
        await tick()

        // B has A's commitment on record, but not the number behind it: the
        // record carries only the hash — no bid, no salt. (Substring-checking
        // the hash for "90" would be flaky: a random salt's hex can contain it.)
        const [onlyCommit] = h.get(B).commitments()
        expect(onlyCommit.participant).toBe(A)
        expect(onlyCommit.commitment).toMatch(/^[0-9a-f]{64}$/)
        const serialized = JSON.stringify(h.get(B).commitments())
        for (const leak of ['"bid"', '"price"', '"salt"']) expect(serialized).not.toContain(leak)
        expect(Object.keys(onlyCommit).sort()).toEqual(["commitment", "participant", "sequence"])
        expect(h.get(B).state).toBe("commit") // not everyone has committed yet
    })
})

describe("SealedEnvelopeSession — fairness", () => {
    it("rejects a reveal that lands before the commit phase closed", async () => {
        const h = harness([A, B, C])
        await h.get(A).commit({ price: 90 })
        await tick()
        // A is still in commit (B, C haven't committed). A peeking at a reveal
        // now would let it re-bid against a number it should not yet see.
        const early = h.raw(B, "sealed-envelope-reveal", { bid: { price: 100 }, salt: "de" })
        expect(() => h.get(A).onIncoming(early)).toThrow(/before the commit phase closed/)
    })

    it("cannot reveal through the API while bids are still open", async () => {
        const h = harness([A, B])
        await h.get(A).commit({ price: 90 })
        await tick()
        await expect(h.get(A).reveal()).rejects.toThrow(/cannot reveal — phase is commit/)
    })
})

describe("SealedEnvelopeSession — cheating is contained, not fatal", () => {
    it("disqualifies a reveal whose bid does not match its commitment", async () => {
        const h = harness([A, B], { compareBids: byPrice })
        await h.get(A).commit({ price: 90 })
        await h.get(B).commit({ price: 100 })
        await tick()

        // A opens honestly; B hand-crafts a reveal for a different number than
        // it sealed. B's commitment was to {price:100}; it now claims 999.
        await h.get(A).reveal()
        const bCommitment = h.get(A).commitments().find(c => c.participant === B)!.commitment
        const forged = h.raw(B, "sealed-envelope-reveal", { bid: { price: 999 }, salt: "00" })
        expect(commitmentHex({ price: 999 }, "00")).not.toBe(bCommitment) // sanity
        h.get(A).onIncoming(forged)
        await tick()

        const o = h.get(A).outcome()
        expect(o.state).toBe("closed") // every committer accounted for → auto-closed
        expect(o.disqualified).toEqual([B])
        expect(o.reveals.map(r => r.participant)).toEqual([A])
        expect(o.winner).toBe(A) // the only valid bid wins by default
    })

    it("disqualifies a committer who never reveals, at the deadline", async () => {
        const h = harness([A, B], { compareBids: byPrice })
        await h.get(A).commit({ price: 90 })
        await h.get(B).commit({ price: 100 })
        await tick()

        await h.get(A).reveal()
        await tick()
        expect(h.get(A).state).toBe("reveal") // B still owes a reveal

        // Deadline: A closes the auction; B forfeits its (higher) sealed bid.
        const o = h.get(A).close()
        expect(o.state).toBe("closed")
        expect(o.disqualified).toEqual([B])
        expect(o.winner).toBe(A)
        expect(o.winningBid).toEqual({ price: 90 })
    })
})

describe("SealedEnvelopeSession — deadlines & exclusion", () => {
    it("closeCommitPhase excludes a non-committer without disqualifying it", async () => {
        const h = harness([A, B, C], { compareBids: byPrice })
        await h.get(A).commit({ price: 90 })
        await h.get(B).commit({ price: 100 })
        await tick()
        expect(h.get(A).state).toBe("commit") // C hasn't committed

        // Every online party hits the commit deadline and closes its commit
        // phase — the committed set is locked to {A, B}. C, having never bid,
        // moves to reveal with nothing to open.
        for (const p of [A, B, C]) h.get(p).closeCommitPhase()
        expect(h.get(A).state).toBe("reveal")

        await h.get(A).reveal()
        await h.get(B).reveal()
        await tick()

        const o = h.get(A).outcome()
        expect(o.state).toBe("closed")
        expect(o.winner).toBe(B)
        // C never committed, so it is simply not in the auction — not disqualified.
        expect(o.disqualified).toEqual([])
        expect(o.reveals).toHaveLength(2)
    })
})

describe("SealedEnvelopeSession — protocol guards", () => {
    it("rejects double commit, double reveal, and reveal-before-commit", async () => {
        const h = harness([A, B])
        await h.get(A).commit({ price: 90 })
        await expect(h.get(A).commit({ price: 91 })).rejects.toThrow(/already committed/)

        await h.get(B).commit({ price: 100 })
        await tick()
        await h.get(A).reveal()
        await expect(h.get(A).reveal()).rejects.toThrow(/already revealed/)

        const fresh = harness([A, B])
        await fresh.get(B).commit({ price: 5 })
        await tick()
        await expect(fresh.get(A).reveal()).rejects.toThrow(/never committed|phase is commit/)
    })

    it("rejects a commit from a non-participant and a duplicate inbound commit", async () => {
        const h = harness([A, B])
        const outsider = h.raw(C, "sealed-envelope-commit", { commitment: "ab".repeat(32) })
        expect(() => h.get(A).onIncoming(outsider)).toThrow(/non-participant/)

        await h.get(B).commit({ price: 100 })
        await tick()
        const dupe = h.raw(B, "sealed-envelope-commit", { commitment: "cd".repeat(32) } as SealedCommitBody)
        expect(() => h.get(A).onIncoming(dupe)).toThrow(/duplicate commit/)
    })

    it("rejects a commit that arrives after the commit phase closed", async () => {
        const h = harness([A, B])
        await h.get(A).commit({ price: 90 })
        await h.get(B).commit({ price: 100 })
        await tick()
        expect(h.get(A).state).toBe("reveal")
        const late = h.raw(B, "sealed-envelope-commit", { commitment: "ee".repeat(32) })
        expect(() => h.get(A).onIncoming(late)).toThrow(/after commit phase closed/)
    })
})

describe("SealedEnvelopeSession — abort", () => {
    it("aborts terminally and refuses further transitions", async () => {
        const h = harness([A, B])
        await h.get(A).commit({ price: 90 })
        await h.get(A).abort("changed my mind")
        await tick()

        expect(h.get(A).state).toBe("aborted")
        expect(h.get(A).outcome().reason).toBe("changed my mind")
        expect(h.get(B).state).toBe("aborted") // the abort propagated
        await expect(h.get(A).commit({ price: 1 })).rejects.toThrow(/phase is aborted/)
    })

    it("construction rejects a me that is not among participants", () => {
        expect(
            () =>
                new SealedEnvelopeSession({
                    me: C,
                    participants: [A, B],
                    send: async () => ({}) as ChannelMessage,
                }),
        ).toThrow(/not a participant/)
    })
})
