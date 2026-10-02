import { Demos } from "@/websdk"

/**
 * The node returns the CONFIRMED nonce but requires the exact next one —
 * `confirmed + 1 + pending` (node `validateTransaction.ts`). `getNextNonce`
 * expresses the no-pending case (`confirmed + 1`) once, so hand-derived nonces
 * stop landing on the off-by-one.
 */
function demosReporting(nonceValue: unknown) {
    const demos = new Demos()
    jest.spyOn(demos, "nodeCall").mockResolvedValue(nonceValue as any)
    return demos
}

const ADDRESS = "0x" + "ab".repeat(32)

describe("getNextNonce", () => {
    it("is one past the confirmed nonce", async () => {
        const demos = demosReporting(5)

        await expect(demos.getAddressNonce(ADDRESS)).resolves.toBe(5)
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("handles the string shape the node sometimes returns", async () => {
        const demos = demosReporting("5")

        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("starts a fresh account at 1", async () => {
        const demos = demosReporting(null)

        await expect(demos.getAddressNonce(ADDRESS)).resolves.toBe(0)
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(1)
    })

    it("asks the node for the address it was given", async () => {
        const demos = demosReporting(2)

        await demos.getNextNonce(ADDRESS)

        expect(demos.nodeCall).toHaveBeenCalledWith("getAddressNonce", {
            address: ADDRESS,
        })
    })
})

/**
 * #118 — nonce lag after a web2/DAHR request. A DAHR/web2 request consumes a
 * nonce exactly like a transfer, but `getAddressNonce` only advances on
 * inclusion, so a hand-derived `getNextNonce` returns a value that collides
 * with the still-pending DAHR tx. The documented fix is to wait for the nonce
 * to advance ({@link waitForNonce}) before deriving the next one.
 */
describe("nonce lag after a web2/DAHR request (#118)", () => {
    it("getNextNonce cannot see a pending DAHR tx, so it repeats the same value", async () => {
        // The DAHR tx took nonce 6 but is not yet included: the confirmed nonce
        // still reads 5, so getNextNonce keeps handing back 6 and a second
        // hand-derived send would reuse the in-flight nonce.
        const demos = demosReporting(5)

        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("waitForNonce rides out the lag until the DAHR tx is included", async () => {
        // Confirmed nonce stays at 5 while the DAHR tx (nonce 6) is pending,
        // then advances to 6 once the node includes it.
        const demos = new Demos()
        const observed = [5, 5, 6]
        jest.spyOn(demos, "nodeCall").mockImplementation(
            async () => (observed.length > 1 ? observed.shift() : observed[0]) as any,
        )

        await expect(
            demos.waitForNonce(ADDRESS, 6, { timeoutMs: 1000, pollIntervalMs: 1 }),
        ).resolves.toBeGreaterThanOrEqual(6)
    })
})
