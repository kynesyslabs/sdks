import { Demos } from "@/websdk/demosclass"

const ADDR = "0x" + "aa".repeat(32)

/**
 * Stub the node RPC surface so we can drive nonce logic without a live node.
 * `supportsPending` toggles whether the node exposes the new
 * `getAddressPendingNonce` handler (older nodes throw "unknown method").
 */
function stubNode(
    demos: Demos,
    state: { confirmed: number; pending?: number; supportsPending: boolean },
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(demos as any).nodeCall = async (method: string) => {
        if (method === "getAddressPendingNonce") {
            if (!state.supportsPending) throw new Error("unknown method")
            return state.pending
        }
        if (method === "getAddressNonce") return state.confirmed
        throw new Error("unexpected nodeCall: " + method)
    }
}

describe("Demos auto-nonce", () => {
    it("is opt-in: no reserver until enabled", () => {
        const d = new Demos()
        expect(d.autoNonceEnabled).toBe(false)
        expect(d._nonceReserver(ADDR)).toBeUndefined()

        d.enableAutoNonce()
        expect(d.autoNonceEnabled).toBe(true)
        expect(typeof d._nonceReserver(ADDR)).toBe("function")

        d.disableAutoNonce()
        expect(d.autoNonceEnabled).toBe(false)
        expect(d._nonceReserver(ADDR)).toBeUndefined()
    })

    it("getAddressPendingNonce uses the node value when supported", async () => {
        const d = new Demos()
        stubNode(d, { confirmed: 4, pending: 9, supportsPending: true })
        expect(await d.getAddressPendingNonce(ADDR)).toBe(9)
    })

    it("getAddressPendingNonce falls back to confirmed+1 on older nodes", async () => {
        const d = new Demos()
        stubNode(d, { confirmed: 4, supportsPending: false })
        expect(await d.getAddressPendingNonce(ADDR)).toBe(5)
    })

    it("reserver sequences nonces from the pending base without re-reading", async () => {
        const d = new Demos()
        d.enableAutoNonce()
        stubNode(d, { confirmed: 4, pending: 9, supportsPending: true })

        const r = d._nonceReserver(ADDR)!
        const got = await Promise.all([r(), r(), r()])
        expect(got).toEqual([9, 10, 11])
    })

    it("resetNonce reseeds from the node on the next send", async () => {
        const d = new Demos()
        d.enableAutoNonce()
        const state = { confirmed: 4, pending: 9, supportsPending: true }
        stubNode(d, state)

        const r = d._nonceReserver(ADDR)!
        expect(await r()).toBe(9)
        expect(await r()).toBe(10)

        state.pending = 20 // chain moved on
        d.resetNonce(ADDR)
        expect(await r()).toBe(20)
        expect(await r()).toBe(21)
    })
})
