import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"

/**
 * Under keylessWeb2Identity nodes link GitHub, Discord and Twitter accounts
 * through TLSNotary only. The SDK refuses the web2 proof-URL path for them
 * before signing, so the caller does not pay for a link the node refuses, and
 * accepts a twitter TLSN link only where the node knows the X endpoint.
 */
const forkStatus = (activated: boolean) => ({
    activated,
    activationHeight: activated ? 0 : null,
    currentHeight: 10,
})

async function signingDemos(
    forks: Record<string, boolean>,
): Promise<{ demos: Demos; signed: any[] }> {
    const demos = new Demos()
    const networkInfo = {
        forks: {
            osDenomination: forkStatus(true),
            ...Object.fromEntries(
                Object.entries(forks).map(([name, on]) => [name, forkStatus(on)]),
            ),
        },
        chainId: 1,
    }
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getAddressNonce"
            ? 3
            : message === "getNetworkInfo"
              ? networkInfo
              : null
    await demos.connectWallet(demos.newMnemonic())

    const signed: any[] = []
    jest.spyOn(demos, "confirm").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    return { demos, signed }
}

const web2Link = (demos: Demos, context: string, proof: string) =>
    new Identities().inferWeb2Identity(demos, {
        context,
        proof,
        username: "octocat",
        userId: "583231",
    } as any)

const tlsnLink = (
    demos: Demos,
    context: "github" | "twitter",
    options?: { legacy?: boolean },
) =>
    new Identities().addWeb2IdentityViaTLSN(
        demos,
        context,
        { data: "ab".repeat(64) } as any,
        "f".repeat(64),
        { recv: [], sent: [] } as any,
        [1, 2, 3],
        "octocat",
        "583231",
        undefined,
        options,
    )

const PROOFS: Record<string, string> = {
    github: "https://gist.github.com/octocat/0123456789abcdef",
    discord: "https://discord.com/channels/1/2/3",
    twitter: "https://x.com/octocat/status/1",
}

beforeAll(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
})

describe("web2 proof-URL links under keylessWeb2Identity", () => {
    it.each(Object.keys(PROOFS))("refuses %s before signing", async context => {
        const { demos, signed } = await signingDemos({
            tlsnVerified: true,
            keylessWeb2Identity: true,
        })
        await expect(web2Link(demos, context, PROOFS[context])).rejects.toThrow(
            "keylessWeb2Identity",
        )
        expect(signed).toHaveLength(0)
    })

    it.each(Object.keys(PROOFS))("does not refuse %s without the fork", async context => {
        const { demos } = await signingDemos({ tlsnVerified: true })
        const error = await web2Link(demos, context, PROOFS[context]).then(
            () => null,
            (e: Error) => e,
        )
        expect(String(error?.message ?? "")).not.toContain("keylessWeb2Identity")
    })
})

describe("twitter TLSN link", () => {
    it("is signed once keylessWeb2Identity is active", async () => {
        const { demos, signed } = await signingDemos({
            tlsnVerified: true,
            keylessWeb2Identity: true,
        })
        await tlsnLink(demos, "twitter")
        expect(signed).toHaveLength(1)
    })

    it("is refused before signing without keylessWeb2Identity", async () => {
        const { demos, signed } = await signingDemos({ tlsnVerified: true })
        await expect(tlsnLink(demos, "twitter")).rejects.toThrow("keylessWeb2Identity")
        expect(signed).toHaveLength(0)
    })

    it("is refused in legacy mode on a network without keylessWeb2Identity", async () => {
        const { demos, signed } = await signingDemos({})
        await expect(tlsnLink(demos, "twitter", { legacy: true })).rejects.toThrow(
            "keylessWeb2Identity",
        )
        expect(signed).toHaveLength(0)
    })

    it("leaves github TLSN links unchanged without the fork", async () => {
        const { demos, signed } = await signingDemos({ tlsnVerified: true })
        await tlsnLink(demos, "github")
        expect(signed).toHaveLength(1)
    })
})

describe("convenience web2 methods under keylessWeb2Identity", () => {
    it("refuse before any platform lookup", async () => {
        const { demos, signed } = await signingDemos({
            tlsnVerified: true,
            keylessWeb2Identity: true,
        })
        const lookups = [
            jest.spyOn(demos.web2, "getTweet"),
            jest.spyOn(demos.web2, "getDiscordMessage"),
        ]
        const ids = new Identities()
        await expect(ids.addGithubIdentity(demos, PROOFS.github as any)).rejects.toThrow(
            "keylessWeb2Identity",
        )
        await expect(ids.addTwitterIdentity(demos, PROOFS.twitter as any)).rejects.toThrow(
            "keylessWeb2Identity",
        )
        await expect(ids.addDiscordIdentity(demos, PROOFS.discord as any)).rejects.toThrow(
            "keylessWeb2Identity",
        )
        for (const lookup of lookups) expect(lookup).not.toHaveBeenCalled()
        expect(signed).toHaveLength(0)
    })
})
