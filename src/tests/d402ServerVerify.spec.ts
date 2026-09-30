import { D402Server } from "@/d402/server/D402Server"

/**
 * verify() reads the payment back with the `getTxByHash` nodeCall, the only
 * transaction lookup every node serves. The node's answer is stubbed at the
 * fetch boundary with the envelope a real node returns.
 */
const RPC = "http://localhost:53550"
const HASH = "ab".repeat(32)
const PAYER = "0x" + "cd".repeat(32)
const PAYEE = "0x" + "ef".repeat(32)

function storedPayment(over: Record<string, any> = {}, content: Record<string, any> = {}) {
    return {
        hash: HASH,
        blockNumber: 250197,
        status: "confirmed",
        ...over,
        content: {
            type: "d402_payment",
            from: PAYER,
            from_ed25519_address: PAYER,
            to: PAYEE,
            amount: 0,
            nonce: 5,
            timestamp: 1_700_000_000_000,
            data: ["d402_payment", { to: PAYEE, amount: "1000", memo: "resourceId:report-42" }],
            gcr_edits: [
                { type: "balance", operation: "remove", isRollback: false, account: PAYER, txhash: HASH, amount: "1000" },
                { type: "balance", operation: "add", isRollback: false, account: PAYEE, txhash: HASH, amount: "1000" },
            ],
            ...content,
        },
    }
}

let requests: { url: string; body: any }[]

function nodeAnswers(response: any, result = 200, httpStatus = 200) {
    requests = []
    ;(global as any).fetch = jest.fn(async (url: string, init: any) => {
        requests.push({ url, body: JSON.parse(init.body) })
        if (url !== RPC) {
            return { ok: false, status: 404, json: async () => ({}) }
        }
        return {
            ok: httpStatus === 200,
            status: httpStatus,
            json: async () => ({ result, response, require_reply: false, extra: null }),
        }
    })
}

const realFetch = global.fetch
afterEach(() => {
    ;(global as any).fetch = realFetch
})

describe("D402Server.verify", () => {
    it("verifies a confirmed payment through the getTxByHash nodeCall", async () => {
        nodeAnswers(storedPayment())
        const result = await new D402Server({ rpcUrl: RPC }).verify(HASH)

        expect(result).toMatchObject({
            valid: true,
            verified_from: PAYER,
            verified_to: PAYEE,
            verified_amount: "1000",
            verified_memo: "resourceId:report-42",
        })
        expect(requests).toHaveLength(1)
        expect(requests[0].url).toBe(RPC)
        expect(requests[0].body.method).toBe("nodeCall")
        expect(requests[0].body.params[0]).toMatchObject({
            message: "getTxByHash",
            data: { hash: HASH },
        })
    })

    it("serves a verified payment from the cache without asking the node again", async () => {
        nodeAnswers(storedPayment())
        const server = new D402Server({ rpcUrl: RPC })
        await server.verify(HASH)
        const again = await server.verify(HASH)

        expect(again.valid).toBe(true)
        expect(requests).toHaveLength(1)
    })

    it("passes validatePayment end to end for the requirement it paid", async () => {
        nodeAnswers(storedPayment())
        const server = new D402Server({ rpcUrl: RPC })
        const result = await server.verify(HASH)

        expect(
            server.validatePayment(result, { amount: "1000", recipient: PAYEE, resourceId: "report-42" }),
        ).toBe(true)
    })

    it.each([
        ["the node has no such transaction", "error", 400],
        ["the node answers with an error object", { code: "ECONNRESET" }, 500],
    ])("refuses when %s", async (_why, response, result) => {
        nodeAnswers(response, result)
        expect((await new D402Server({ rpcUrl: RPC }).verify(HASH)).valid).toBe(false)
    })

    it("refuses when the RPC itself fails", async () => {
        nodeAnswers(storedPayment(), 200, 502)
        expect((await new D402Server({ rpcUrl: RPC }).verify(HASH)).valid).toBe(false)
    })

    it.each([
        ["another transaction's answer", storedPayment({ hash: "12".repeat(32) })],
        ["a failed transaction", storedPayment({ status: "failed" })],
        ["a transaction not in a block", storedPayment({ blockNumber: null })],
        ["a transaction of another type", storedPayment({}, { type: "native" })],
        [
            "a credit that disagrees with the signed payload",
            storedPayment({}, {
                gcr_edits: [
                    { type: "balance", operation: "add", isRollback: false, account: PAYER, txhash: HASH, amount: "1000" },
                ],
            }),
        ],
    ])("refuses %s", async (_why, tx) => {
        nodeAnswers(tx)
        expect((await new D402Server({ rpcUrl: RPC }).verify(HASH)).valid).toBe(false)
    })
})
