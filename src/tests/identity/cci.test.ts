import { Demos, DemosWebAuth } from "@/websdk"
import {
    demosClaimRefForAddress,
    demosAddressFromClaim,
    isDemosClaim,
    normalizeDemosAddress,
    parseClaimRef,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"

describe("CCI ClaimReference", () => {
    describe("parseClaimRef", () => {
        it("parses a demos claim", () => {
            const claim = "demos:0xabcdef" as ClaimReference
            expect(parseClaimRef(claim)).toEqual({
                scheme: "demos",
                identifier: "0xabcdef",
            })
        })

        it("parses a forward-compat scheme", () => {
            const claim = "eip155:0x1234" as ClaimReference
            expect(parseClaimRef(claim)).toEqual({
                scheme: "eip155",
                identifier: "0x1234",
            })
        })

        it("rejects a malformed ref (no colon)", () => {
            expect(() =>
                parseClaimRef("malformed" as ClaimReference),
            ).toThrow(/malformed ClaimReference/)
        })

        it("rejects an empty identifier", () => {
            expect(() =>
                parseClaimRef("demos:" as ClaimReference),
            ).toThrow(/malformed ClaimReference/)
        })

        it("rejects a missing scheme", () => {
            expect(() =>
                parseClaimRef(":0xabc" as ClaimReference),
            ).toThrow(/malformed ClaimReference/)
        })
    })

    describe("demosClaimRefForAddress", () => {
        it("builds a demos: claim from a 0x address", () => {
            const addr = "0x" + "a".repeat(64)
            expect(demosClaimRefForAddress(addr)).toBe(`demos:${addr}`)
        })

        it("lowercases the address", () => {
            const addr = "0x" + "AB".repeat(32)
            expect(demosClaimRefForAddress(addr)).toBe(
                `demos:0x${"ab".repeat(32)}`,
            )
        })

        it("accepts an un-prefixed hex address", () => {
            const addr = "a".repeat(64)
            expect(demosClaimRefForAddress(addr)).toBe(
                `demos:0x${"a".repeat(64)}`,
            )
        })

        it("rejects a non-hex string", () => {
            expect(() => demosClaimRefForAddress("not-hex")).toThrow()
        })

        it("rejects a wrong-length hex", () => {
            expect(() => demosClaimRefForAddress("0xab")).toThrow(
                /Ed25519 address/,
            )
        })
    })

    describe("isDemosClaim", () => {
        it("true for demos:", () => {
            expect(
                isDemosClaim(
                    ("demos:0x" + "a".repeat(64)) as ClaimReference,
                ),
            ).toBe(true)
        })

        it("false for eip155:", () => {
            expect(
                isDemosClaim("eip155:0x1234" as ClaimReference),
            ).toBe(false)
        })

        it("false for malformed", () => {
            expect(isDemosClaim("nope" as ClaimReference)).toBe(false)
        })
    })

    describe("demosAddressFromClaim", () => {
        it("returns the normalized address", () => {
            const claim = ("demos:0x" + "A".repeat(64)) as ClaimReference
            expect(demosAddressFromClaim(claim)).toBe("0x" + "a".repeat(64))
        })

        it("throws for non-demos scheme", () => {
            expect(() =>
                demosAddressFromClaim("eip155:0xabc" as ClaimReference),
            ).toThrow(/scheme/)
        })
    })

    describe("normalizeDemosAddress", () => {
        it("adds 0x prefix and lowercases", () => {
            expect(normalizeDemosAddress("A".repeat(64))).toBe(
                "0x" + "a".repeat(64),
            )
        })

        it("rejects non-hex", () => {
            expect(() => normalizeDemosAddress("not-hex".repeat(10))).toThrow()
        })

        it("rejects wrong length", () => {
            expect(() => normalizeDemosAddress("ab")).toThrow(/Ed25519/)
        })
    })
})

describe("CCI signWithPrimaryClaim / verifyPrimaryClaimSignature", () => {
    let demos: Demos
    let auth: DemosWebAuth
    let claim: ClaimReference

    beforeAll(async () => {
        demos = new Demos()
        auth = new DemosWebAuth()
        await auth.create()
        await demos.connectWallet(auth.keypair.privateKey as Uint8Array)
        claim = demosClaimRefForAddress(await demos.getEd25519Address())
    })

    it("signs and verifies a payload via the connected Demos key", async () => {
        const payload = new TextEncoder().encode("dacs-channelmsg:v1:abc123")
        const sig = await signWithPrimaryClaim(claim, payload, demos)
        expect(sig).toBeInstanceOf(Uint8Array)
        expect(sig.length).toBe(64)
        expect(verifyPrimaryClaimSignature(claim, payload, sig)).toBe(true)
    })

    it("verify returns false for a tampered payload", async () => {
        const payload = new TextEncoder().encode("dacs-channelmsg:v1:abc123")
        const sig = await signWithPrimaryClaim(claim, payload, demos)
        const tampered = new TextEncoder().encode("dacs-channelmsg:v1:abc124")
        expect(verifyPrimaryClaimSignature(claim, tampered, sig)).toBe(false)
    })

    it("verify returns false for a wrong-key claim", async () => {
        const payload = new TextEncoder().encode("dacs-binding:v1:xyz")
        const sig = await signWithPrimaryClaim(claim, payload, demos)
        const otherAuth = new DemosWebAuth()
        await otherAuth.create()
        const otherDemos = new Demos()
        await otherDemos.connectWallet(
            otherAuth.keypair.privateKey as Uint8Array,
        )
        const otherClaim = demosClaimRefForAddress(
            await otherDemos.getEd25519Address(),
        )
        expect(verifyPrimaryClaimSignature(otherClaim, payload, sig)).toBe(
            false,
        )
    })

    it("refuses non-demos schemes", async () => {
        const payload = new TextEncoder().encode("anything")
        await expect(
            signWithPrimaryClaim(
                "eip155:0x1234" as ClaimReference,
                payload,
                demos,
            ),
        ).rejects.toThrow(/unsupported scheme/)
    })

    it("refuses if claim does not match connected wallet", async () => {
        const otherAuth = new DemosWebAuth()
        await otherAuth.create()
        const otherDemos = new Demos()
        await otherDemos.connectWallet(
            otherAuth.keypair.privateKey as Uint8Array,
        )
        const otherClaim = demosClaimRefForAddress(
            await otherDemos.getEd25519Address(),
        )

        const payload = new TextEncoder().encode("dacs-binding:v1:abc")
        await expect(
            signWithPrimaryClaim(otherClaim, payload, demos),
        ).rejects.toThrow(/does not match connected/)
    })
})
