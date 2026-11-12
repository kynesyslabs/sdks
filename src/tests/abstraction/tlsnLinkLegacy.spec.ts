import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"

/**
 * Nodes check only the shape of a TLSN presentation, not the notary
 * signature, so mainnet refuses TLSN identity links from genesis
 * (tlsnProofEnforcement). The SDK refuses to sign one unless the caller says
 * the network runs without that fork.
 */
async function signingDemos(): Promise<{ demos: Demos; signed: any[] }> {
    const demos = new Demos()
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getAddressNonce" ? 3 : null
    await demos.connectWallet(demos.newMnemonic())

    const signed: any[] = []
    jest.spyOn(demos, "confirm").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    return { demos, signed }
}

const link = (demos: Demos, options?: { legacy?: boolean }) =>
    new Identities().addWeb2IdentityViaTLSN(
        demos,
        "github",
        { data: "ab".repeat(64) } as any,
        "f".repeat(64),
        { recv: [], sent: [] } as any,
        [1, 2, 3],
        "octocat",
        583231,
        undefined,
        options,
    )

describe("TLSN identity link", () => {
    it("is refused before signing unless legacy is set", async () => {
        const { demos, signed } = await signingDemos()
        await expect(link(demos)).rejects.toThrow("tlsnProofEnforcement")
        await expect(link(demos, { legacy: false })).rejects.toThrow("tlsnProofEnforcement")
        expect(signed).toHaveLength(0)
    })

    it("is signed as before with legacy: true", async () => {
        const { demos, signed } = await signingDemos()
        await link(demos, { legacy: true })
        expect(signed).toHaveLength(1)
        expect(signed[0].content.data[1].method).toBe("tlsn_identity_assign")
        expect(signed[0].content.data[1].payload.username).toBe("octocat")
    })
})
