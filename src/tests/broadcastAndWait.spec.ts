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
