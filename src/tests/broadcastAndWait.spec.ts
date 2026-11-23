import { readFileSync } from "fs"
import { join } from "path"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { BroadcastTimeoutError } from "@/websdk/BroadcastTimeoutError"

// The validity data is a node response, not something the SDK builds, so a
// fixture is the honest shape to drive these tests with.
const TX_HASH = "a".repeat(64)

function validityData(hash: string = TX_HASH) {
    return {
        response: {
            data: {
                valid: true,
                message: "",
                transaction: { hash },
            },
        },
    } as any
}

/**
 * Stands in for a Demos instance: `broadcast` goes through `call("execute", ...)`
 * and every status poll through `call("nodeCall", "getTransactionStatus", ...)`.
 */
function mockDemos(statuses: Array<Record<string, unknown>>) {
    const calls: string[] = []
    const demos = {
        call: jest.fn(async (method: string, message: string) => {
            calls.push(`${method}:${message}`)
            if (method === "execute") return { result: 200, response: "ok" }
            return statuses.shift() ?? { state: "pending" }
        }),
    } as any
    return { demos, calls }
}

describe("broadcastAndWait returns the transaction hash", () => {
    it("reports the hash alongside the included status", async () => {
        const { demos } = mockDemos([{ state: "included", blockNumber: 42 }])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(),
            demos,
            { pollIntervalMs: 1 },
        )

        expect(res.hash).toBe(TX_HASH)
        expect(res.status).toEqual({ state: "included", blockNumber: 42 })
        expect(res.broadcast).toEqual({ result: 200, response: "ok" })
    })

    it("reports the hash on a failed transaction too", async () => {
        const { demos } = mockDemos([{ state: "failed" }])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(),
            demos,
            { pollIntervalMs: 1 },
        )

        expect(res.hash).toBe(TX_HASH)
        expect(res.status.state).toBe("failed")
    })

    it("returns the hash the status polls ran against", async () => {
        const nodeHash = "b".repeat(64)
        const { demos } = mockDemos([{ state: "included" }])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(nodeHash),
            demos,
            { pollIntervalMs: 1 },
        )

        expect(res.hash).toBe(nodeHash)
        expect(demos.call).toHaveBeenCalledWith(
            "nodeCall",
            "getTransactionStatus",
            { hash: nodeHash },
        )
    })

    it("still carries the hash on a timeout instead of returning one", async () => {
        const { demos } = mockDemos([])

        await expect(
            DemosTransactions.broadcastAndWait(validityData(), demos, {
                timeoutMs: 5,
                pollIntervalMs: 1,
            }),
        ).rejects.toMatchObject({ txHash: TX_HASH })
    })

    it("rejects when the validity data carries no hash", async () => {
        const { demos } = mockDemos([{ state: "included" }])
        const missing = validityData()
        delete missing.response.data.transaction.hash

        await expect(
            DemosTransactions.broadcastAndWait(missing, demos, {
                pollIntervalMs: 1,
            }),
        ).rejects.toThrow()
    })
})

describe("broadcastAndWait with waitForResultCommitment", () => {
    // Status bodies as kynesyslabs/node v1.0.0-rc.14 answers them, shared
    // with the demos-native tests.
    const { replies } = JSON.parse(
        readFileSync(
            join(
                __dirname,
                "../../packages/demos-native/test/fixtures/node-proof-calls.json",
            ),
            "utf8",
        ),
    )
    const status = (name: string) =>
        structuredClone(replies[name].reply.response)

    it("is off by default: the status is the old two fields at once", async () => {
        const { demos } = mockDemos([status("statusIncludedAwaitingCommitment")])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(),
            demos,
            { pollIntervalMs: 1 },
        )

        expect(res.status).toEqual({ state: "included", blockNumber: 529_478 })
    })

    it("polls past included until the result is committed", async () => {
        const { demos, calls } = mockDemos([
            { state: "pending" },
            status("statusIncludedAwaitingCommitment"),
            status("statusIncludedCommitted"),
        ])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(),
            demos,
            { pollIntervalMs: 1, waitForResultCommitment: true },
        )

        expect(res.hash).toBe(TX_HASH)
        expect(res.status).toEqual(status("statusIncludedCommitted"))
        expect(res.status.resultCommittedInBlock).toBe(529_479)
        expect(calls.filter(c => c === "nodeCall:getTransactionStatus")).toHaveLength(3)
    })

    it("returns at once when no block commits the result (before the fork)", async () => {
        const { demos } = mockDemos([status("statusFailedPreFork")])

        const res = await DemosTransactions.broadcastAndWait(
            validityData(),
            demos,
            { pollIntervalMs: 1, waitForResultCommitment: true },
        )

        expect(res.status).toEqual(status("statusFailedPreFork"))
        expect("resultCommittedInBlock" in res.status).toBe(false)
    })

    it("times out with the terminal state when the commitment never comes", async () => {
        const awaiting = status("statusIncludedAwaitingCommitment")
        const demos = {
            call: jest.fn(async (method: string) =>
                method === "execute"
                    ? { result: 200, response: "ok" }
                    : structuredClone(awaiting),
            ),
        } as any

        await expect(
            DemosTransactions.broadcastAndWait(validityData(), demos, {
                timeoutMs: 20,
                pollIntervalMs: 1,
                waitForResultCommitment: true,
            }),
        ).rejects.toMatchObject({
            name: "BroadcastTimeoutError",
            txHash: TX_HASH,
            lastSeenState: "included",
        })
    })
})

describe("broadcastAndWait stops the commitment wait at its timeout", () => {
    const awaiting = {
        state: "included",
        blockNumber: 1,
        resultCommittedInBlock: null,
    }
    const committed = { ...awaiting, resultCommittedInBlock: 2 }

    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    /** Status replies in order; a `[ms, body]` entry answers `ms` after the poll. */
    function slowDemos(replies: Array<object | [number, object]>) {
        return {
            call: jest.fn(async (method: string) => {
                if (method === "execute") return { result: 200, response: "ok" }
                const next = replies.shift() ?? { state: "pending" }
                if (!Array.isArray(next)) return next
                const [ms, body] = next
                return new Promise(r => setTimeout(() => r(body), ms))
            }),
        } as any
    }

    /**
     * Runs the wait on the fake clock and reports how it settled, when (ms
     * after the start) and how many timers were still pending at that moment.
     */
    async function settle(
        demos: any,
        opts: { timeoutMs: number; pollIntervalMs: number },
    ) {
        const t0 = Date.now()
        let outcome: { value?: any; error?: any; at: number; timers: number }
        const done = (o: { value?: any; error?: any }) => {
            outcome = {
                ...o,
                at: Date.now() - t0,
                timers: jest.getTimerCount(),
            }
        }
        DemosTransactions.broadcastAndWait(validityData(), demos, {
            ...opts,
            waitForResultCommitment: true,
        }).then(
            value => done({ value }),
            error => done({ error }),
        )
        await jest.advanceTimersByTimeAsync(5_000)
        return outcome!
    }

    it("rejects a commitment that arrives after the deadline", async () => {
        const demos = slowDemos([awaiting, [250, committed]])

        const { value, error, at } = await settle(demos, {
            timeoutMs: 100,
            pollIntervalMs: 10,
        })

        expect(value).toBeUndefined()
        expect(error).toBeInstanceOf(BroadcastTimeoutError)
        expect(error).toMatchObject({
            txHash: TX_HASH,
            lastSeenState: "included",
        })
        expect(at).toBeGreaterThanOrEqual(100)
        expect(at).toBeLessThanOrEqual(110)
        expect(error.elapsedMs).toBe(at)
    })

    it("does not sleep past the deadline to poll again", async () => {
        const demos = slowDemos([awaiting, committed])

        const { value, error, at } = await settle(demos, {
            timeoutMs: 100,
            pollIntervalMs: 1_000,
        })

        expect(value).toBeUndefined()
        expect(error).toMatchObject({
            name: "BroadcastTimeoutError",
            lastSeenState: "included",
        })
        expect(at).toBeLessThanOrEqual(110)
        // Only the first poll ran; the one due after the deadline did not.
        expect(demos.call).toHaveBeenCalledTimes(2)
    })

    it("reports failed as the last seen state of a failed transaction", async () => {
        const failed = { ...awaiting, state: "failed", code: 1, message: "x" }
        const demos = slowDemos([
            failed,
            [250, { ...failed, resultCommittedInBlock: 2 }],
        ])

        const { error } = await settle(demos, {
            timeoutMs: 100,
            pollIntervalMs: 10,
        })

        expect(error).toMatchObject({
            name: "BroadcastTimeoutError",
            lastSeenState: "failed",
        })
    })

    it("still returns a commitment that arrives before the deadline", async () => {
        const demos = slowDemos([awaiting, [50, committed]])

        const { value, error, at, timers } = await settle(demos, {
            timeoutMs: 100,
            pollIntervalMs: 10,
        })

        expect(error).toBeUndefined()
        expect(value.status).toEqual(committed)
        expect(at).toBe(60)
        // The deadline timer raced against the poll is cleared once it answers.
        expect(timers).toBe(0)
    })

    it.each([Infinity, 2 ** 32])(
        "keeps waiting with timeoutMs %p, past the setTimeout range",
        async timeoutMs => {
            const demos = slowDemos([awaiting, [50, committed]])

            const { value, error } = await settle(demos, {
                timeoutMs,
                pollIntervalMs: 10,
            })

            expect(error).toBeUndefined()
            expect(value.status).toEqual(committed)
        },
    )
})

describe("BroadcastTimeoutError", () => {
    it("keeps the hash reachable for a caller resuming the poll", () => {
        const error = new BroadcastTimeoutError({
            txHash: TX_HASH,
            lastSeenState: "pending",
            elapsedMs: 100,
        })

        expect(error.txHash).toBe(TX_HASH)
    })
})
