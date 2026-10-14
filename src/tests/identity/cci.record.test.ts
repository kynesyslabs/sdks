import type { AccountIdentities } from "@/types/gls/account"
import {
    cciClaimFor,
    cciLinksFrom,
    cciSchemes,
    demosClaimRefForAddress,
    type CciRecord,
} from "@/identity/cci"

const EVM = "0xAbC0000000000000000000000000000000000001"
const EVM_CLAIM = `evm:${EVM.toLowerCase()}`
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

        expect(claims).toEqual([EVM_CLAIM, `solana:${SOL}`, "twitter:agent"].sort())
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
            [EVM_CLAIM, `solana:${SOL}`, "twitter:agent"].sort(),
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

describe("claim spelling", () => {
    it("normalises hex addresses — the same EVM wallet is one identity", () => {
        // The node can hand back either checksum spelling for the same wallet;
        // a raw compare would call them two different identities.
        const shouted = { xm: { evm: { mainnet: [{ address: EVM.toUpperCase().replace("0X", "0x") }] } } }
        const quiet = { xm: { evm: { mainnet: [{ address: EVM.toLowerCase() }] } } }
        expect(cciLinksFrom(shouted)[0].claim).toBe(cciLinksFrom(quiet)[0].claim)
        expect(cciLinksFrom(shouted)[0].claim).toBe(`evm:${EVM.toLowerCase()}`)
    })

    it("leaves base58 alone — lowercasing Solana would be a different account", () => {
        // Solana addresses are case-SENSITIVE; "normalising" one corrupts it.
        expect(cciLinksFrom(IDENTITIES).find((l) => l.context === "solana")?.claim).toBe(
            `solana:${SOL}`,
        )
    })
})

describe("TLSN-proven identities", () => {
    it("are picked up — the node files them under web2.<platform>, not a tlsn key", () => {
        // Review flagged these as dropped. They are not: tlsnRoutines writes to
        // `identities.web2[context]` with context = github|discord|telegram, and
        // web2 parsing is generic over the platform key.
        const viaTlsn = {
            web2: {
                github: [
                    { username: "octocat", userId: "583231", proof: "{}", proofHash: "0x", recvHash: "0x" },
                ],
                discord: [{ username: "agent#1", userId: "99" }],
            },
        }
        expect(cciLinksFrom(viaTlsn).map((l) => l.claim).sort()).toEqual(
            ["discord:agent#1", "github:octocat"].sort(),
        )
        expect(cciLinksFrom(viaTlsn)[0].kind).toBe("web2")
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
        expect(cciClaimFor(record, "evm")).toBe(EVM_CLAIM)
        expect(cciClaimFor(record, "bitcoin")).toBeUndefined()
    })
})
