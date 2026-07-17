import type { AccountIdentities } from "@/types/gls/account"
import {
    cciClaimFor,
    cciLinksFrom,
    cciSchemes,
    demosClaimRefForAddress,
    type CciRecord,
} from "@/identity/cci"

const EVM = "0xAbC0000000000000000000000000000000000001"
const SOL = "So1anaAddress1111111111111111111111111111111"

/** The identities blob exactly as the node's GCR models it. */
const IDENTITIES: AccountIdentities = {
    xm: {
        evm: {
            mainnet: [
                {
                    address: EVM,
                    publicKey: "0x04aa",
                    signature: "0xsig",
                    timestamp: 1_700_000_000,
                    signedData: "demos-link",
                },
            ],
        },
        solana: {
            mainnet: [
                {
                    address: SOL,
                    publicKey: "sol-pub",
                    signature: "sol-sig",
                    timestamp: 1_700_000_001,
                    signedData: "demos-link",
                },
            ],
        },
    },
    pqc: {},
    web2: {
        twitter: [
            {
                proof: "https://x.com/agent/status/1",
                userId: "42",
                username: "agent",
                proofHash: "0xhash",
                timestamp: 1_700_000_002,
            },
        ],
    },
}

describe("cciLinksFrom — the linked identities become claims", () => {
    it("flattens other-chain wallets and web2 accounts into ClaimReferences", () => {
        const links = cciLinksFrom(IDENTITIES)
        const claims = links.map((l) => l.claim).sort()

        expect(claims).toEqual([`evm:${EVM}`, `solana:${SOL}`, "twitter:agent"].sort())
        expect(links.find((l) => l.context === "evm")).toMatchObject({ kind: "xm" })
        expect(links.find((l) => l.context === "twitter")).toMatchObject({ kind: "web2" })
        // The original entry survives for anything the flat shape drops.
        expect((links.find((l) => l.context === "evm")?.raw as { signature?: string })?.signature)
            .toBe("0xsig")
    })

    it("prefers the human handle but falls back to the stable id", () => {
        const noHandle = { web2: { twitter: [{ userId: "42", proofHash: "0x" }] } }
        expect(cciLinksFrom(noHandle)[0].claim).toBe("twitter:42")
    })

    it("survives identity kinds it has never heard of", () => {
        // The node grows kinds (ud, nomis, humanpassport, ethos, tlsn) faster
        // than this type does. Asking "who is this agent" must not blow up
        // because an unknown one showed up.
        const future = {
            ...IDENTITIES,
            nomis: { score: 800 },
            ethos: [{ weird: true }],
            ud: null,
        }
        expect(cciLinksFrom(future).map((l) => l.claim).sort()).toEqual(
            [`evm:${EVM}`, `solana:${SOL}`, "twitter:agent"].sort(),
        )
    })

    it("returns nothing rather than throwing on junk", () => {
        for (const junk of [undefined, null, 42, "nope", [], { xm: "not-an-object" }]) {
            expect(cciLinksFrom(junk)).toEqual([])
        }
    })

    it("reads a pqc co-signer as a claim keyed by algorithm", () => {
        const withPqc = { pqc: { falcon: { publicKey: "falcon-pub" }, mldsa: "ml-pub" } }
        expect(cciLinksFrom(withPqc).map((l) => l.claim).sort()).toEqual(
            ["falcon:falcon-pub", "mldsa:ml-pub"].sort(),
        )
        expect(cciLinksFrom(withPqc)[0].kind).toBe("pqc")
    })
})

describe("record helpers", () => {
    const record: CciRecord = {
        primary: demosClaimRefForAddress("0x" + "a".repeat(64)),
        address: "0x" + "a".repeat(64),
        links: cciLinksFrom(IDENTITIES),
        raw: IDENTITIES,
    }

    it("lists the schemes an account has proven", () => {
        expect(cciSchemes(record).sort()).toEqual(["evm", "solana", "twitter"])
    })

    it("finds the account's claim on a given scheme", () => {
        expect(cciClaimFor(record, "twitter")).toBe("twitter:agent")
        expect(cciClaimFor(record, "evm")).toBe(`evm:${EVM}`)
        expect(cciClaimFor(record, "bitcoin")).toBeUndefined()
    })
})
