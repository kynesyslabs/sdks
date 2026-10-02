import { Demos } from "@/websdk"
import { l2psHistoryAuthMessage, legacyL2psHistoryAuthMessage } from "@/l2ps"
import { Cryptography } from "@/encryption/Cryptography"
import { hexToUint8Array } from "@/encryption/unifiedCrypto"

/**
 * The subnet history reader.
 *
 * A node will not serve an account's L2PS history to anyone but its owner, so
 * the whole value of this call is that the request it builds actually verifies
 * on the other side — which is a signature over the raw bytes of
 * `getL2PSHistory:<l2psUid>:<address>:<timestamp>`, with no display prefix.
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

describe("the since cursor's page metadata", () => {
    it("reports the filtered count, and no more pages once the cursor is reached", async () => {
        const demos = new Demos()
        ;(demos as any).nodeCall = async () => ({
            transactions: [
                { hash: "newest", timestamp: "400" },
                { hash: "newer", timestamp: "300" },
                { hash: "older", timestamp: "100" },
            ],
            count: 3,
            hasMore: true,
        })
        await demos.connectWallet(demos.newMnemonic())

        const page = await demos.getL2PSHistory(SUBNET, { since: 200 })

        expect(page.transactions.map(t => t.hash)).toEqual(["newest", "newer"])
        expect(page.count).toBe(2)
        expect(page.hasMore).toBe(false)
    })

    it("keeps the node's metadata when the cursor filtered nothing", async () => {
        const demos = new Demos()
        ;(demos as any).nodeCall = async () => ({
            transactions: [{ hash: "newest", timestamp: "400" }],
            count: 1,
            hasMore: true,
        })
        await demos.connectWallet(demos.newMnemonic())

        const page = await demos.getL2PSHistory(SUBNET, { since: 200 })

        expect(page.count).toBe(1)
        expect(page.hasMore).toBe(true)
    })
})

describe("a node that predates the subnet-bound signature", () => {
    function legacyNode(demos: Demos) {
        const signed: string[] = []
        ;(demos as any).nodeCall = async (_message: string, args: any) => {
            const legacy = legacyL2psHistoryAuthMessage(args.address, Number(args.timestamp))
            const ok = Cryptography.verify(
                legacy,
                Buffer.from(hexToUint8Array(args.signature)),
                Buffer.from(hexToUint8Array(args.address)),
            )
            signed.push(ok ? "legacy" : "current")
            return ok
                ? { l2psUid: SUBNET, address: args.address, transactions: [], count: 0, hasMore: false }
                : "Invalid signature. Unable to verify address ownership."
        }
        return signed
    }

    it("is never sent the unbound signature on its own say-so", async () => {
        const demos = new Demos()
        const signed = legacyNode(demos)
        await demos.connectWallet(demos.newMnemonic())

        await expect(demos.getL2PSHistory(SUBNET)).rejects.toThrow("legacyAuth")
        expect(signed).toEqual(["current"])
    })

    it("is read with the legacy message when the caller opts in", async () => {
        const demos = new Demos()
        const signed = legacyNode(demos)
        await demos.connectWallet(demos.newMnemonic())

        const page = await demos.getL2PSHistory(SUBNET, { legacyAuth: true })

        expect(signed).toEqual(["legacy"])
        expect(page.transactions).toEqual([])
    })

    it("surfaces any other refusal instead of returning it as a page", async () => {
        const demos = new Demos()
        let calls = 0
        ;(demos as any).nodeCall = async () => {
            calls += 1
            return "Request expired or invalid timestamp."
        }
        await demos.connectWallet(demos.newMnemonic())

        await expect(demos.getL2PSHistory(SUBNET)).rejects.toThrow("Request expired")
        expect(calls).toBe(1)
    })
})
