import { Demos } from "@/websdk"
import { l2psHistoryAuthMessage } from "@/l2ps"
import { Cryptography } from "@/encryption/Cryptography"
import { hexToUint8Array } from "@/encryption/unifiedCrypto"

/**
 * The subnet history reader.
 *
 * A node will not serve an account's L2PS history to anyone but its owner, so
 * the whole value of this call is that the request it builds actually verifies
 * on the other side — which is a signature over the raw bytes of
 * `getL2PSHistory:<address>:<timestamp>`, with no display prefix.
 */

const SUBNET = "subnet-under-test"

async function connectedDemos(): Promise<{ demos: Demos; calls: any[] }> {
    const demos = new Demos()
    const calls: any[] = []
    ;(demos as any).nodeCall = async (message: string, args: any) => {
        calls.push({ message, args })
        return {
            l2psUid: SUBNET,
            address: args.address,
            authenticated: true,
            transactions: [],
            count: 0,
            hasMore: false,
        }
    }
    await demos.connectWallet(demos.newMnemonic())
    return { demos, calls }
}

describe("Demos.getL2PSHistory", () => {
    test("signs the message the node verifies, over raw bytes", async () => {
        const { demos, calls } = await connectedDemos()

        await demos.getL2PSHistory(SUBNET)

        const { message, args } = calls[0]
        expect(message).toBe("getL2PSAccountTransactions")

        const expected = l2psHistoryAuthMessage(SUBNET, args.address, Number(args.timestamp))
        expect(
            Cryptography.verify(
                expected,
                Buffer.from(hexToUint8Array(args.signature)),
                Buffer.from(hexToUint8Array(args.address)),
            ),
        ).toBe(true)
    })

    test("does not sign a prefixed message, which would not verify", async () => {
        const { demos, calls } = await connectedDemos()

        await demos.getL2PSHistory(SUBNET)

        const { args } = calls[0]
        const prefixed = `\x19Demos Signed Message:\n${l2psHistoryAuthMessage(SUBNET, args.address, Number(args.timestamp))}`
        expect(
            Cryptography.verify(
                prefixed,
                Buffer.from(hexToUint8Array(args.signature)),
                Buffer.from(hexToUint8Array(args.address)),
            ),
        ).toBe(false)
    })

    test("stamps the request with the current time, so the node's freshness window can judge it", async () => {
        const { demos, calls } = await connectedDemos()
        const before = Date.now()

        await demos.getL2PSHistory(SUBNET)

        const timestamp = Number(calls[0].args.timestamp)
        expect(timestamp).toBeGreaterThanOrEqual(before)
        expect(timestamp).toBeLessThanOrEqual(Date.now())
    })

    test("passes paging through", async () => {
        const { demos, calls } = await connectedDemos()

        await demos.getL2PSHistory(SUBNET, {
            limit: 25,
            offset: 50,
            since: 1_700_000_000_000,
        })

        expect(calls[0].args).toMatchObject({
            l2psUid: SUBNET,
            limit: 25,
            offset: 50,
            since: 1_700_000_000_000,
        })
    })

    test("refuses to ask for an address it cannot sign for", async () => {
        const { demos, calls } = await connectedDemos()

        await expect(
            demos.getL2PSHistory(SUBNET, { address: "ab".repeat(32) }),
        ).rejects.toThrow(/connected identity/)
        expect(calls).toHaveLength(0)
    })
})

describe("what the signature covers", () => {
    it("names the subnet, so one signature cannot read another", async () => {
        const { demos, calls } = await connectedDemos()

        await demos.getL2PSHistory(SUBNET)

        const { args } = calls[0]
        expect(
            Cryptography.verify(
                l2psHistoryAuthMessage("some-other-subnet", args.address, Number(args.timestamp)),
                Buffer.from(hexToUint8Array(args.signature)),
                Buffer.from(hexToUint8Array(args.address)),
            ),
        ).toBe(false)
    })

    it("builds a request on an instance that has no identity yet", async () => {
        // The underlying accessor throws a bare property access rather than
        // reporting absence, so this used to fail with a TypeError.
        const demos = new Demos()
        const calls: any[] = []
        ;(demos as any).nodeCall = async (message: string, args: any) => {
            calls.push({ message, args })
            return { transactions: [], count: 0, hasMore: false }
        }

        await demos.getL2PSHistory(SUBNET)

        expect(calls[0].args.address).toMatch(/^(0x)?[0-9a-f]{64}$/)
    })
})

describe("the since cursor", () => {
    it("is applied even when the node ignores it", async () => {
        const demos = new Demos()
        ;(demos as any).nodeCall = async () => ({
            transactions: [
                { hash: "old", timestamp: "100" },
                { hash: "new", timestamp: "300" },
            ],
            count: 2,
            hasMore: false,
        })
        await demos.connectWallet(demos.newMnemonic())

        const page = await demos.getL2PSHistory(SUBNET, { since: 200 })

        expect(page.transactions.map(t => t.hash)).toEqual(["new"])
    })
})
