import { Demos } from "@/websdk"
import { Web2Proxy } from "@/websdk/Web2Calls"

/**
 * The node returns the CONFIRMED nonce. Once its `nonceEnforcement` upgrade is
 * active it requires the exact next one — `confirmed + 1 + pending` (node
 * mempool admission). `getNextNonce`
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
/**
 * A Demos wired to a node whose confirmed nonce for ADDRESS is `confirmed`
 * and which answers a DAHR request; records every transaction it signs.
 */
function demosRunningDahr(confirmed: number) {
    const demos = new Demos()
    const signed: any[] = []
    jest.spyOn(demos, "nodeCall").mockResolvedValue(confirmed as any)
    jest.spyOn(demos, "getEd25519Address").mockResolvedValue(ADDRESS)
    jest.spyOn(demos, "call").mockResolvedValue({
        result: 200,
        response: {
            status: 200,
            statusText: "OK",
            headers: {},
            responseHash: "0x01",
            responseHeadersHash: "0x02",
        },
    } as any)
    jest.spyOn(demos, "sign").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    jest.spyOn(demos, "confirm").mockResolvedValue({
        response: { data: { transaction: { hash: "0xdahr" } } },
    } as any)
    jest.spyOn(demos, "broadcast").mockResolvedValue({} as any)
    return { demos, signed }
}

describe("nonce lag after a web2/DAHR request (#118)", () => {
    const request = { method: "GET", url: "https://example.com" } as any

    it("a DAHR request signs confirmed + 1, and getNextNonce repeats it until inclusion", async () => {
        const { demos, signed } = demosRunningDahr(5)

        await new Web2Proxy("session", demos).startProxy(request)

        expect(signed).toHaveLength(1)
        expect(signed[0].content.type).toBe("web2Request")
        expect(signed[0].content.nonce).toBe(6)
        // The DAHR tx holds nonce 6 but the chain still reports 5, so a
        // hand-derived next send would reuse the in-flight nonce.
        await expect(demos.getNextNonce(ADDRESS)).resolves.toBe(6)
    })

    it("with auto-nonce, a send after a DAHR request takes the next nonce", async () => {
        const { demos, signed } = demosRunningDahr(5)
        demos.enableAutoNonce()

        await new Web2Proxy("session", demos).startProxy(request)
        await new Web2Proxy("session", demos).startProxy(request)

        expect(signed.map(tx => tx.content.nonce)).toEqual([6, 7])
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
