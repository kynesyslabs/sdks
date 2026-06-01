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

    test("createDomainProofPayload returns a validly-signed web2 proof", async () => {
        const payload = await identities.createDomainProofPayload(demos)
        const parts = payload.split(":")

        expect(parts).toHaveLength(4)
        expect(parts[0]).toBe("demos")
        expect(parts[1]).toBe("dw2p")
        expect(parts[2]).toBe("ed25519")

        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const sigValid = await demos.crypto.verify({
            algorithm: "ed25519",
            message: new TextEncoder().encode("dw2p"),
            signature: hexToBytes(parts[3]),
            publicKey: publicKey as Uint8Array,
        } as any)

        expect(sigValid).toBe(true)
    })

    test("normalizeHostname reduces URLs/hosts to bare hostname", () => {
        const norm = (input: string): string =>
            (identities as any).normalizeHostname(input)

        expect(norm("https://example.com/foo")).toBe("example.com")
        expect(norm("example.com/")).toBe("example.com")
        expect(norm("http://sub.example.com:8443/x")).toBe("sub.example.com")
        expect(norm("  example.com  ")).toBe("example.com")
        expect(norm("example.com")).toBe("example.com")
    })

    test("addDomainIdentity builds the correct web2/domain request", async () => {
        const payload = await identities.createDomainProofPayload(demos)

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
