import { Demos } from "@/websdk/demosclass"

const ADDR = "0x" + "aa".repeat(32)

/**
 * Stub the node RPC surface so we can drive nonce logic without a live node.
 * `getAddressNonce` returns the confirmed nonce; the auto-nonce manager seeds
 * from that + 1 and then increments locally.
 */
function stubNode(demos: Demos, state: { confirmed: number }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(demos as any).nodeCall = async (method: string) => {
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

    it("reserver seeds from confirmed+1 and sequences locally without re-reading", async () => {
        const d = new Demos()
        d.enableAutoNonce()
        const state = { confirmed: 4 }
        stubNode(d, state)

        const r = d._nonceReserver(ADDR)!
        // confirmed=4 -> first usable nonce 5, then local increments 6, 7.
        const got = await Promise.all([r(), r(), r()])
        expect(got).toEqual([5, 6, 7])
    })

    it("resetNonce reseeds from the confirmed nonce on the next send", async () => {
        const d = new Demos()
        d.enableAutoNonce()
        const state = { confirmed: 4 }
        stubNode(d, state)

        const r = d._nonceReserver(ADDR)!
        expect(await r()).toBe(5)
        expect(await r()).toBe(6)

        state.confirmed = 19 // chain moved on (e.g. another client sent)
        d.resetNonce(ADDR)
        expect(await r()).toBe(20)
        expect(await r()).toBe(21)
    })
})
