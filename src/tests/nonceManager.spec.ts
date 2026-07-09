import { NonceManager } from "@/websdk/NonceManager"

const ADDR = "0x" + "ab".repeat(32)

describe("NonceManager", () => {
    it("seeds from fetchNext once, then increments locally", async () => {
        let calls = 0
        const fetchNext = async () => {
            calls++
            return 5
        }
        const m = new NonceManager()

        expect(await m.reserve(ADDR, fetchNext)).toBe(5)
        expect(await m.reserve(ADDR, fetchNext)).toBe(6)
        expect(await m.reserve(ADDR, fetchNext)).toBe(7)
        // Seeded exactly once — later reservations don't re-read the node.
        expect(calls).toBe(1)
    })

    it("gives concurrent reservations distinct, contiguous nonces (no collision)", async () => {
        let calls = 0
        const fetchNext = async () => {
            calls++
            // Simulate node latency so races would surface without serialization.
            await new Promise(r => setTimeout(r, 5))
            return 10
        }
        const m = new NonceManager()

        const results = await Promise.all(
            Array.from({ length: 20 }, () => m.reserve(ADDR, fetchNext)),
        )
        const sorted = [...results].sort((a, b) => a - b)

        expect(new Set(results).size).toBe(20) // all unique
        expect(sorted).toEqual(
            Array.from({ length: 20 }, (_, i) => 10 + i),
        )
        expect(calls).toBe(1) // seeded once despite concurrency
    })

    it("keys state per address", async () => {
        const other = "0x" + "cd".repeat(32)
        const m = new NonceManager()
        expect(await m.reserve(ADDR, async () => 1)).toBe(1)
        expect(await m.reserve(other, async () => 100)).toBe(100)
        expect(await m.reserve(ADDR, async () => 999)).toBe(2) // ADDR keeps its own counter
        expect(await m.reserve(other, async () => 999)).toBe(101)
    })

    it("reseeds from the node after reset", async () => {
        const m = new NonceManager()
        expect(await m.reserve(ADDR, async () => 3)).toBe(3)
        expect(await m.reserve(ADDR, async () => 3)).toBe(4)
        m.reset(ADDR)
        // Chain advanced to 8 while we were away — reseed picks it up.
        expect(await m.reserve(ADDR, async () => 8)).toBe(8)
        expect(await m.reserve(ADDR, async () => 8)).toBe(9)
    })

    it("does not poison the address after a transient seed failure", async () => {
        const m = new NonceManager()
        let attempt = 0
        const flaky = async () => {
            attempt++
            if (attempt === 1) throw new Error("transient RPC error")
            return 42
        }
        await expect(m.reserve(ADDR, flaky)).rejects.toThrow("transient RPC error")
        // Next reservation retries the seed and succeeds.
        expect(await m.reserve(ADDR, flaky)).toBe(42)
        expect(await m.reserve(ADDR, flaky)).toBe(43)
    })

    it("seed() forces the next reserved nonce; peek() reports it", async () => {
        const m = new NonceManager()
        expect(m.peek(ADDR)).toBeUndefined()
        m.seed(ADDR, 77)
        expect(m.peek(ADDR)).toBe(77)
        expect(await m.reserve(ADDR, async () => 0)).toBe(77)
        expect(m.peek(ADDR)).toBe(78)
    })
})
