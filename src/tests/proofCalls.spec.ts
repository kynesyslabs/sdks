import http from "http"
import type { AddressInfo } from "net"
import { readFileSync } from "fs"
import { join } from "path"
import { Demos, NodeCallError, TransportError } from "@/websdk"

/**
 * The typed finality and storage proof reads against a local fake node that
 * answers with replies shaped as kynesyslabs/node v1.0.0-rc.14 sends them.
 * The replies are shared with the demos-native tests; see the fixture's
 * `_about` and each entry's `source`.
 */
const { replies } = JSON.parse(
    readFileSync(
        join(
            __dirname,
            "../../packages/demos-native/test/fixtures/node-proof-calls.json",
        ),
        "utf8",
    ),
)
const body = (name: string) => structuredClone(replies[name].reply.response)
// The included-but-failed transfer of the node's requester fixture N07.
const N07_HASH =
    "85b8fcdcee48822742a39e1b9877f5e2f8dde36430e8e486e3a8b0c9a7744cbd"

/** What the node answers next, one entry per POST: a fixture name or `{ status, text }`. */
let queue: Array<string | { status: number; text?: string }> = []
let seen: Array<{ body: any; headers: http.IncomingHttpHeaders }> = []
const last = () => seen[seen.length - 1]
let server: http.Server
let url: string

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = ""
        req.on("data", chunk => (raw += chunk))
        req.on("end", () => {
            seen.push({ body: JSON.parse(raw), headers: req.headers })
            const next = queue.shift()
            res.setHeader("Content-Type", "application/json")
            if (typeof next === "object") {
                res.statusCode = next.status
                res.end(next.text ?? "{}")
            } else {
                res.end(JSON.stringify(replies[next].reply))
            }
        })
    })
    await new Promise<void>(resolve =>
        server.listen(0, "127.0.0.1", () => resolve()),
    )
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
    queue = []
    seen = []
})

function connected() {
    const demos = new Demos()
    ;(demos as any).rpc_url = url
    return demos
}

describe("typed finality and storage proof reads", () => {
    it("return the node's answer from a plain, unauthenticated nodeCall", async () => {
        const demos = connected()
        const proofHash = body("transactionProof").hash
        const cases: Array<[string, () => Promise<unknown>, string, object]> = [
            ["chainIdentity", () => demos.getChainIdentity(), "getChainIdentity", {}],
            ["finalizedHead", () => demos.getFinalizedHead(), "getFinalizedHead", {}],
            ["blockSegment", () => demos.getBlockSegment(529_478, 529_479), "getBlockSegment", { from: 529_478, to: 529_479 }],
            ["validatorSet", () => demos.getValidatorSet(529_478), "getValidatorSet", { blockNumber: 529_478 }],
            ["transactionProof", () => demos.getTransactionProof(proofHash), "getTransactionProof", { hash: proofHash }],
            ["storageProof", () => demos.getStorageProof(["stor-a", "stor-b"]), "getStorageProof", { storageAddresses: ["stor-a", "stor-b"] }],
            ["storageProof", () => demos.getStorageProof(["stor-a"], 529_470), "getStorageProof", { storageAddresses: ["stor-a"], blockNumber: 529_470 }],
            ["storageProgramLimits", () => demos.getStorageProgramLimits(), "getStorageProgramLimits", {}],
        ]
        for (const [fixture, read, message, data] of cases) {
            queue.push(fixture)
            expect(await read()).toEqual(body(fixture))
            const { body: sent, headers } = last()
            expect(sent).toEqual({ method: "nodeCall", params: [{ message, data }] })
            expect(headers.identity).toBeUndefined()
            expect(headers.signature).toBeUndefined()
        }
    })

    it("keep failed, checkedThroughBlock and resultCommittedInBlock in a status", async () => {
        const demos = connected()
        queue.push(
            "statusFailedPreFork",
            "statusIncludedAwaitingCommitment",
            "statusIncludedCommitted",
        )

        const failed = await demos.getTransactionStatus(N07_HASH)
        expect(last().body.params[0].data).toEqual({ hash: N07_HASH })
        expect(failed).toEqual({
            state: "failed",
            blockNumber: 480_877,
            code: "TX_NONCE_INVALID_LOW",
            message: "Nonce too low",
            checkedThroughBlock: 529_479,
        })
        // Before the finalityProofs fork no block commits the result: absent, not null.
        expect("resultCommittedInBlock" in failed).toBe(false)

        const awaiting = await demos.getTransactionStatus("ab".repeat(32))
        expect(awaiting.resultCommittedInBlock).toBeNull()
        const committed = await demos.getTransactionStatus("ab".repeat(32))
        expect(committed.resultCommittedInBlock).toBe(529_479)
    })

    it("throw a refusal with its result code, reason and body", async () => {
        const demos = connected()
        const refusals: Array<[string, () => Promise<unknown>, number, string]> = [
            ["transactionProofNoResultCommitment", () => demos.getTransactionProof(N07_HASH), 404, "no_result_commitment"],
            ["transactionProofNotYetCommitted", () => demos.getTransactionProof("ab".repeat(32)), 409, "not_yet_committed"],
            ["statusNotFound", () => demos.getTransactionStatus("ab".repeat(32)), 404, "not_found"],
            ["finalizedHeadNotSynced", () => demos.getFinalizedHead(), 503, "node_not_synced"],
            ["validatorSetHistoryUnavailable", () => demos.getValidatorSet(12), 410, "history_unavailable"],
            ["blockSegmentRangeTooLarge", () => demos.getBlockSegment(0, 10_000), 400, "range_too_large"],
            ["storageProofHistoryUnavailable", () => demos.getStorageProof(["stor-a"], 100), 410, "history_unavailable"],
        ]
        for (const [fixture, read, result, reason] of refusals) {
            queue.push(fixture)
            const error: any = await read().catch(e => e)
            expect(error).toBeInstanceOf(NodeCallError)
            expect(error).toMatchObject({
                name: "NodeCallError",
                result,
                reason,
                response: body(fixture),
            })
            expect(error.message).toContain(`refused with ${result}: ${reason}`)
        }

        // The pre-fork refusal names the block; a not-found status the height searched.
        queue.push("transactionProofNoResultCommitment", "statusNotFound")
        await expect(demos.getTransactionProof(N07_HASH)).rejects.toMatchObject({
            response: { error: "no_result_commitment", blockNumber: 480_877 },
        })
        await expect(
            demos.getTransactionStatus("ab".repeat(32)),
        ).rejects.toMatchObject({
            response: { state: "unknown", checkedThroughBlock: 529_479 },
        })
    })

    it("refuse without a reason on a node that does not serve the call", async () => {
        const demos = connected()
        queue.push("unknownMessage")
        const error: any = await demos.getFinalizedHead().catch(e => e)
        expect(error).toBeInstanceOf(NodeCallError)
        expect(error.result).toBe(404)
        expect(error.reason).toBeUndefined()
        expect(error.message).toContain("refused with 404: Unknown message")
    })

    it("leave nodeCall returning the bare body of the same refusal", async () => {
        const demos = connected()
        queue.push("transactionProofNoResultCommitment")
        expect(
            await demos.nodeCall("getTransactionProof", { hash: N07_HASH }),
        ).toEqual(body("transactionProofNoResultCommitment"))
    })

    it("do not read a transport failure or a malformed reply as a refusal", async () => {
        const demos = connected()
        queue.push({ status: 400 })
        const error: any = await demos.getChainIdentity().catch(e => e)
        expect(error).toBeInstanceOf(TransportError)
        expect(error).not.toBeInstanceOf(NodeCallError)

        queue.push({ status: 200, text: JSON.stringify({ response: {} }) })
        await expect(demos.getChainIdentity()).rejects.toThrow(
            "no valid getChainIdentity reply",
        )
        queue.push({
            status: 200,
            text: JSON.stringify({ result: 200, response: "STATE_NOT_READY" }),
        })
        await expect(demos.getChainIdentity()).rejects.toThrow(
            "no valid getChainIdentity answer",
        )
    })
})
