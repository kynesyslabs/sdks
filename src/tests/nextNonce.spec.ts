import { Demos } from "@/websdk"

/**
 * The node returns the CONFIRMED nonce and accepts only `nonce > confirmed`
 * (node `validateTransaction.ts`: "Expected >= confirmed + 1"). `getNextNonce`
 * is that contract expressed once, so hand-derived nonces stop landing on the
 * off-by-one.
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
