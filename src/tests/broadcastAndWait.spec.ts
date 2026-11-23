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
