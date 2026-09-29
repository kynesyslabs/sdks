import { Demos } from "@/websdk"
import { D402Client } from "@/d402/client/D402Client"

/**
 * A d402 payment built by the client has to be signable, and settling it has
 * to go through an RPC the node implements. Each case runs the real
 * createPayment, sign and settle; only the node's answers are stubbed.
 */
const PAYEE = "0x" + "bb".repeat(32)
const REQUIREMENT = { amount: "1000", recipient: PAYEE, resourceId: "report-42" }

interface NodeScript {
    finalState?: "included" | "failed"
    rejectConfirm?: boolean
}

async function clientWithNode(script: NodeScript = {}) {
    const demos = new Demos()
    const calls: string[] = []
    ;(demos as any).nodeCall = async (message: string) => {
        calls.push(`nodeCall:${message}`)
        if (message === "getAddressNonce") return 4
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
        if (extra === "broadcastTx") return { result: 200, response: { message: "ok" } }
        if (message === "getTransactionStatus") {
            return { state: script.finalState ?? "included", blockNumber: 250197 }
        }
        throw new Error(`unexpected call ${method} ${message} ${extra}`)
    }
    await demos.connectWallet(demos.newMnemonic())
    return { client: new D402Client(demos), demos, calls }
}

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

    it("settles through confirm and broadcast, and reports the block it landed in", async () => {
        const { client, calls } = await clientWithNode()

        const result = await client.settle(await client.createPayment(REQUIREMENT))

        expect(result).toMatchObject({ success: true, blockNumber: 250197 })
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
        expect(calls).toContain("execute:confirmTx")
        expect(calls).toContain("execute:broadcastTx")
        expect(calls.some(c => c.includes("broadcastNativeTransaction"))).toBe(false)
    })

    it("reports failure when the payment fails on chain or is not valid", async () => {
        const failed = await clientWithNode({ finalState: "failed" })
        const onChain = await failed.client.settle(await failed.client.createPayment(REQUIREMENT))
        expect(onChain.success).toBe(false)
        expect(onChain.hash).toMatch(/^[0-9a-f]{64}$/)

        const invalid = await clientWithNode({ rejectConfirm: true })
        const refused = await invalid.client.settle(await invalid.client.createPayment(REQUIREMENT))
        expect(refused.success).toBe(false)
        expect(refused.message).toContain("insufficient balance")
    })
})
