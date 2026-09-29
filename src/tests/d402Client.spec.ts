import { Demos } from "@/websdk"
import { D402Client } from "@/d402/client/D402Client"

/**
 * A d402 payment built by the client has to be signable, and settling it has
 * to go through RPCs every node serves. Each case runs the real
 * createPayment, sign and settle; only the node's answers are stubbed.
 */
const PAYEE = "0x" + "bb".repeat(32)
const REQUIREMENT = { amount: "1000", recipient: PAYEE, resourceId: "report-42" }

interface NodeScript {
    /** What getTxByHash answers: a stored tx, or nothing yet. */
    stored?: { status: "confirmed" | "failed" } | null
    /** getTxByHash answers with an error object instead, as on a transport failure. */
    lookupError?: boolean
    rejectConfirm?: boolean
    rejectBroadcast?: boolean
    /** The broadcast answer is lost or a 5xx, though the node took the payment. */
    ambiguousBroadcast?: boolean
}

async function clientWithNode(script: NodeScript = {}) {
    const demos = new Demos()
    const calls: string[] = []
    ;(demos as any).nodeCall = async (message: string, data: any) => {
        calls.push(`nodeCall:${message}`)
        if (message === "getAddressNonce") return 4
        if (message === "getTxByHash" && script.lookupError) {
            return { result: 500, response: { code: "ECONNRESET" }, require_reply: false, extra: null }
        }
        if (message === "getTxByHash") {
            const stored = script.stored === undefined ? { status: "confirmed" } : script.stored
            return stored ? { hash: data.hash, blockNumber: 250197, ...stored } : "error"
        }
        return null
    }
    ;(demos as any)._getNetworkParametersCached = async () => null
    ;(demos as any).call = async (method: string, message: string, data: any, extra?: string) => {
        calls.push(`${method}:${extra ?? message}`)
        if (extra === "confirmTx") {
            return {
                result: 200,
                response: {
                    data: script.rejectConfirm
                        ? { valid: false, message: "insufficient balance" }
                        : { valid: true, transaction: data },
                },
            }
        }
        if (extra === "broadcastTx") {
            if (script.ambiguousBroadcast) return { result: 500, response: { code: "ECONNRESET" }, require_reply: false, extra: null }
            return script.rejectBroadcast
                ? { result: 400, response: { message: "nonce already used" } }
                : { result: 200, response: { message: "ok" } }
        }
        throw new Error(`unexpected call ${method} ${message} ${extra}`)
    }
    await demos.connectWallet(demos.newMnemonic())
    return { client: new D402Client(demos), demos, calls }
}

const fast = { timeoutMs: 30, pollIntervalMs: 5 }

describe("D402Client", () => {
    it("builds a payment whose transaction names the payee, so it can be signed", async () => {
        const { client, demos } = await clientWithNode()

        const payment = await client.createPayment(REQUIREMENT)
        expect(payment.content.to).toBe(PAYEE)
        expect(payment.content.nonce).toBe(5)
        expect((payment.content.data as any)[1]).toMatchObject({ to: PAYEE, amount: "1000" })

        const signed = await demos.sign(payment)
        expect(signed.hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("accepts a recipient without the 0x prefix and refuses one that is not an address", async () => {
        const { client } = await clientWithNode()

        const bare = await client.createPayment({ ...REQUIREMENT, recipient: PAYEE.slice(2) })
        expect(bare.content.to).toBe(PAYEE)

        await expect(client.createPayment({ ...REQUIREMENT, recipient: "merchant" })).rejects.toThrow(
            "32-byte hex address",
        )
    })

    it("leaves no nonce gap under auto-nonce when a payment is refused", async () => {
        const { client, demos } = await clientWithNode()
        demos.enableAutoNonce()

        await expect(client.createPayment({ ...REQUIREMENT, recipient: "merchant" })).rejects.toThrow()
        const next = await client.createPayment(REQUIREMENT)
        expect(next.content.nonce).toBe(5)
    })

    it("settles through confirm and broadcast, and reads inclusion back by hash", async () => {
        const { client, calls } = await clientWithNode()

        const result = await client.settle(await client.createPayment(REQUIREMENT), fast)

        expect(result).toMatchObject({ success: true, blockNumber: 250197 })
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
        expect(calls).toEqual(expect.arrayContaining(["execute:confirmTx", "execute:broadcastTx", "nodeCall:getTxByHash"]))
        expect(calls.some(c => c.includes("broadcastNativeTransaction") || c.includes("getTransactionStatus"))).toBe(false)
    })

    it("reports a payment that failed on chain, or that the node refused, as failed", async () => {
        const failed = await clientWithNode({ stored: { status: "failed" } })
        const onChain = await failed.client.settle(await failed.client.createPayment(REQUIREMENT), fast)
        expect(onChain).toMatchObject({ success: false, blockNumber: 250197 })
        expect(onChain.pending).toBeUndefined()

        const invalid = await clientWithNode({ rejectConfirm: true })
        const refused = await invalid.client.settle(await invalid.client.createPayment(REQUIREMENT), fast)
        expect(refused.success).toBe(false)
        expect(refused.message).toContain("insufficient balance")
    })

    it("reports a payment not yet seen as pending, with its hash, not as failed", async () => {
        const slow = await clientWithNode({ stored: null })
        const result = await slow.client.settle(await slow.client.createPayment(REQUIREMENT), fast)

        expect(result).toMatchObject({ success: false, pending: true })
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/)

        // Once it lands, the same hash resolves without a second payment.
        const landed = await clientWithNode()
        expect(await landed.client.waitForSettlement(result.hash, fast)).toMatchObject({ success: true, hash: result.hash })
    })

    it("reports a payment the node refused at broadcast as failed, not pending", async () => {
        const { client, calls } = await clientWithNode({ rejectBroadcast: true })
        const result = await client.settle(await client.createPayment(REQUIREMENT), fast)

        expect(result).toMatchObject({ success: false })
        expect(result.pending).toBeUndefined()
        expect(result.message).toContain("nonce already used")
        expect(calls).not.toContain("nodeCall:getTxByHash")
    })

    it("never takes a lookup error for an included payment", async () => {
        const { client } = await clientWithNode({ lookupError: true })
        const result = await client.settle(await client.createPayment(REQUIREMENT), fast)

        expect(result).toMatchObject({ success: false, pending: true })
    })

    it("checks an ambiguous broadcast by hash instead of calling it refused", async () => {
        const { client, calls } = await clientWithNode({ ambiguousBroadcast: true })
        const result = await client.settle(await client.createPayment(REQUIREMENT), fast)

        expect(calls).toContain("nodeCall:getTxByHash")
        expect(result).toMatchObject({ success: true, blockNumber: 250197 })
    })
})
