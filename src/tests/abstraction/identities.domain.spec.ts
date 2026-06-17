import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"

const MNEMONIC =
    "polar scale globe beauty stock employ rail exercise goat into sample embark"

const hexToBytes = (h: string) => {
    const clean = h.replace(/^0x/, "")
    return new Uint8Array((clean.match(/.{1,2}/g) ?? []).map(b => parseInt(b, 16)))
}

describe("Domain Identities (offline SDK logic)", () => {
    const demos = new Demos()
    const identities = new Identities()

    beforeAll(async () => {
        await demos.connectWallet(MNEMONIC) // local crypto only, no node
    })

    test("createDomainProofPayload signs a host+sender-bound message", async () => {
        const payload = await identities.createDomainProofPayload(demos, "example.com")
        const parts = payload.split(":")

        expect(parts).toHaveLength(4)
        expect(parts[0]).toBe("demos")
        expect(parts[1]).toBe("dw2p")
        expect(parts[2]).toBe("ed25519")

        const sender = await demos.getEd25519Address()
        const { publicKey } = await demos.crypto.getIdentity("ed25519")

        // Verifies against the bound message (host + sender)...
        const boundValid = await demos.crypto.verify({
            algorithm: "ed25519",
            message: new TextEncoder().encode(`dacs-domain:v1:example.com:${sender}`),
            signature: hexToBytes(parts[3]),
            publicKey: publicKey as Uint8Array,
        } as any)
        expect(boundValid).toBe(true)

        // ...and NOT against the bare "dw2p" (the old, unbound format).
        const bareValid = await demos.crypto.verify({
            algorithm: "ed25519",
            message: new TextEncoder().encode("dw2p"),
            signature: hexToBytes(parts[3]),
            publicKey: publicKey as Uint8Array,
        } as any)
        expect(bareValid).toBe(false)
    })

    test("domain proof does not verify for a different host (no cross-domain replay)", async () => {
        const payload = await identities.createDomainProofPayload(demos, "example.com")
        const sig = hexToBytes(payload.split(":")[3])
        const sender = await demos.getEd25519Address()
        const { publicKey } = await demos.crypto.getIdentity("ed25519")

        const liftedToOtherHost = await demos.crypto.verify({
            algorithm: "ed25519",
            message: new TextEncoder().encode(`dacs-domain:v1:evil.com:${sender}`),
            signature: sig,
            publicKey: publicKey as Uint8Array,
        } as any)
        expect(liftedToOtherHost).toBe(false)
    })

    test("buildDomainProof canonicalizes host + URL (incl. IPv6 bracketing)", () => {
        const build = (input: string): { proofUrl: string; hostname: string } =>
            (identities as any).buildDomainProof(input)

        const PATH = "/.well-known/demos-cci.txt"

        expect(build("https://example.com/foo")).toEqual({
            proofUrl: `https://example.com${PATH}`,
            hostname: "example.com",
        })
        expect(build("Example.COM")).toEqual({
            proofUrl: `https://example.com${PATH}`,
            hostname: "example.com",
        })
        expect(build("  sub.example.com  ")).toEqual({
            proofUrl: `https://sub.example.com${PATH}`,
            hostname: "sub.example.com",
        })
        // query/fragment stripped
        expect(build("https://example.com/x?a=1#f").proofUrl).toBe(
            `https://example.com${PATH}`,
        )
        // IPv6: URL keeps the brackets, producing a valid (not "https://::1/")
        // proof URL, and the stored host stays consistent with it.
        expect(build("https://[::1]/x")).toEqual({
            proofUrl: `https://[::1]${PATH}`,
            hostname: "[::1]",
        })
    })

    test("buildDomainProof rejects empty / degenerate inputs", () => {
        const build = (input: string) =>
            (identities as any).buildDomainProof(input)

        expect(() => build("")).toThrow()
        expect(() => build("   ")).toThrow()
        expect(() => build("://")).toThrow()
    })

    test("addDomainIdentity builds the correct web2/domain request", async () => {
        const payload = await identities.createDomainProofPayload(demos, "example.com")

        let proofUrlSeen: string | null = null
        let signedTx: any = null
        ;(demos.web2 as any).getDomainProof = async (url: string) => {
            proofUrlSeen = url
            return { success: true, hostname: "example.com", body: payload }
        }
        ;(demos as any).sign = async (tx: any) => {
            signedTx = tx
            return tx
        }
        ;(demos as any).confirm = async () => ({ result: 200, response: {} })

        await identities.addDomainIdentity(demos, "https://example.com/some/page")

        expect(proofUrlSeen).toBe(
            "https://example.com/.well-known/demos-cci.txt",
        )

        const data = signedTx.content.data
        expect(data[0]).toBe("identity")
        expect(data[1].context).toBe("web2")
        expect(data[1].method).toBe("web2_identity_assign")

        const p = data[1].payload
        expect(p.context).toBe("domain")
        expect(p.proof).toBe("https://example.com/.well-known/demos-cci.txt")
        expect(p.username).toBe("example.com")
        expect(p.userId).toBe("example.com")
    })

    test("inferWeb2Identity rejects a domain proof URL with the wrong path", async () => {
        // A caller bypassing addDomainIdentity must still hit the path check.
        await expect(
            identities.inferWeb2Identity(demos, {
                context: "domain",
                proof: "https://evil.com/malicious",
                username: "evil.com",
                userId: "evil.com",
            } as any),
        ).rejects.toThrow(/domain proof URL/i)
    })

    test("addDomainIdentity throws a clear error when the file is unreadable", async () => {
        ;(demos.web2 as any).getDomainProof = async () => ({
            success: false,
            error: "404 not found",
        })

        await expect(
            identities.addDomainIdentity(demos, "missing.com"),
        ).rejects.toThrow()
    })
})
