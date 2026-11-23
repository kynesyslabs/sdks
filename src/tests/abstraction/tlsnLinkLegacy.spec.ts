import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"

/**
 * Without tlsnVerified a node checks only the shape of a TLSN presentation,
 * not the notary signature, and networks with tlsnProofEnforcement refuse
 * the link. The SDK refuses to sign one there unless the caller says the
 * network runs without either fork. Once a node reports tlsnVerified active
 * it verifies the presentation itself, and the link is signed without
 * `legacy`, except for the telegram context.
 */
const forkStatus = (activated: boolean) => ({
    activated,
    activationHeight: activated ? 0 : null,
    currentHeight: 10,
})

async function signingDemos(
    forks?: Record<string, boolean>,
): Promise<{ demos: Demos; signed: any[] }> {
    const demos = new Demos()
    const networkInfo = forks && {
        forks: {
            osDenomination: forkStatus(true),
            ...Object.fromEntries(
                Object.entries(forks).map(([name, on]) => [name, forkStatus(on)]),
            ),
        },
        chainId: 1,
    }
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getLastBlockNumber"
            ? 100
            : message === "getAddressNonce"
            ? 3
            : message === "getNetworkInfo"
              ? (networkInfo ?? null)
              : null
    await demos.connectWallet(demos.newMnemonic())

    const signed: any[] = []
    jest.spyOn(demos, "confirm").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    return { demos, signed }
}

const link = (
    demos: Demos,
    options?: { legacy?: boolean },
    context: "github" | "discord" | "telegram" = "github",
) =>
    new Identities().addWeb2IdentityViaTLSN(
        demos,
        context,
        { data: "ab".repeat(64) } as any,
        "f".repeat(64),
        { recv: [], sent: [] } as any,
        [1, 2, 3],
        "octocat",
        583231,
        undefined,
        options,
    )

beforeAll(() => {
    // getNetworkInfo warns once when a node does not answer it.
    jest.spyOn(console, "warn").mockImplementation(() => {})
})

describe("TLSN identity link without tlsnVerified", () => {
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

    it("is refused on a network with only tlsnProofEnforcement", async () => {
        const { demos, signed } = await signingDemos({ tlsnProofEnforcement: true })
        await expect(link(demos)).rejects.toThrow("tlsnVerified")
        expect(signed).toHaveLength(0)
    })

    it("is refused while tlsnVerified is scheduled but not active", async () => {
        const { demos, signed } = await signingDemos({
            tlsnProofEnforcement: true,
            tlsnVerified: false,
        })
        await expect(link(demos)).rejects.toThrow("tlsnProofEnforcement")
        expect(signed).toHaveLength(0)
    })
})

describe("TLSN identity link with tlsnVerified active", () => {
    const forks = { tlsnProofEnforcement: true, tlsnVerified: true }

    it("is signed without legacy", async () => {
        const { demos, signed } = await signingDemos(forks)
        await link(demos)
        await link(demos, undefined, "discord")
        expect(signed).toHaveLength(2)
        expect(signed[0].content.type).toBe("identity")
        expect(signed[0].content.data[1].method).toBe("tlsn_identity_assign")
        expect(signed[0].content.data[1].payload.context).toBe("github")
        expect(signed[1].content.data[1].payload.context).toBe("discord")
        expect(signed[0].signature?.data).toBeTruthy()
    })

    it("still refuses the telegram context, legacy or not", async () => {
        const { demos, signed } = await signingDemos(forks)
        await expect(link(demos, undefined, "telegram")).rejects.toThrow("telegram")
        await expect(link(demos, { legacy: true }, "telegram")).rejects.toThrow("telegram")
        expect(signed).toHaveLength(0)
    })
})
