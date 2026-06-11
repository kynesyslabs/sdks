import { Demos, DemosWebAuth } from "@/websdk"
import {
    demosClaimRefForAddress,
    type ClaimReference,
} from "@/identity/cci"
import {
    BINDING_DOMAIN_PREFIX,
    bindingProgramName,
    bindingSigningBytes,
    createMembershipBinding,
    resolveMember,
    signatureFromHex,
    signatureToHex,
    stripBindingSignature,
    verifyMembershipBinding,
    type L2PSMembershipBinding,
} from "@/l2ps/binding"
import { StorageProgram } from "@/storage/StorageProgram"

const CHANNEL = "ch-7f9a"
const MEMBER = "rsa-fingerprint-1"

async function newConnectedDemos(): Promise<Demos> {
    const auth = new DemosWebAuth()
    await auth.create()
    const d = new Demos()
    await d.connectWallet(auth.keypair.privateKey as Uint8Array)
    return d
}

describe("L2PS membership binding (WI-1)", () => {
    let demos: Demos
    let claim: ClaimReference

    beforeAll(async () => {
        demos = await newConnectedDemos()
        claim = demosClaimRefForAddress(await demos.getEd25519Address())
    })

    describe("bindingProgramName", () => {
        it("is deterministic and scoped to channel + member", () => {
            expect(bindingProgramName(CHANNEL, MEMBER)).toBe(
                `l2ps-binding:${CHANNEL}:${MEMBER}`,
            )
        })
    })

    describe("bindingSigningBytes", () => {
        const unsigned = (overrides: Partial<L2PSMembershipBinding> = {}) => ({
            bindingVersion: "1" as const,
            channelId: CHANNEL,
            subnetMemberId: MEMBER,
            cciPrimaryClaim: ("demos:0x" + "a".repeat(64)) as ClaimReference,
            boundAt: 1700000000000,
            ...overrides,
        })

        it("starts with the dacs-binding:v1: domain prefix", () => {
            const bytes = bindingSigningBytes(unsigned())
            const str = new TextDecoder().decode(bytes)
            expect(str.startsWith(BINDING_DOMAIN_PREFIX)).toBe(true)
            expect(str.length).toBe(BINDING_DOMAIN_PREFIX.length + 64)
        })

        it("is stable across invocations", () => {
            const a = bindingSigningBytes(unsigned())
            const b = bindingSigningBytes(unsigned())
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
        })

        it("differs when channelId differs", () => {
            const a = bindingSigningBytes(unsigned({ channelId: "ch-A" }))
            const b = bindingSigningBytes(unsigned({ channelId: "ch-B" }))
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
        })

        it("differs when subnetMemberId differs", () => {
            const a = bindingSigningBytes(unsigned({ subnetMemberId: "m-1" }))
            const b = bindingSigningBytes(unsigned({ subnetMemberId: "m-2" }))
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
        })

        it("differs when boundAt differs", () => {
            const a = bindingSigningBytes(unsigned({ boundAt: 100 }))
            const b = bindingSigningBytes(unsigned({ boundAt: 101 }))
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
        })
    })

    describe("createMembershipBinding", () => {
        it("produces a binding that verifies", async () => {
            const b = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
            })
            expect(b.bindingVersion).toBe("1")
            expect(b.channelId).toBe(CHANNEL)
            expect(b.subnetMemberId).toBe(MEMBER)
            expect(b.cciPrimaryClaim).toBe(claim)
            expect(b.signature.startsWith("0x")).toBe(true)
            expect(verifyMembershipBinding(b)).toBe(true)
        })

        it("refuses missing channelId", async () => {
            await expect(
                createMembershipBinding({
                    channelId: "",
                    subnetMemberId: MEMBER,
                    claim,
                    demos,
                }),
            ).rejects.toThrow(/channelId required/)
        })

        it("refuses missing subnetMemberId", async () => {
            await expect(
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId: "",
                    claim,
                    demos,
                }),
            ).rejects.toThrow(/subnetMemberId required/)
        })

        it("refuses non-demos claim schemes", async () => {
            await expect(
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId: MEMBER,
                    claim: "eip155:0x1234" as ClaimReference,
                    demos,
                }),
            ).rejects.toThrow(/demos:/)
        })

        it("refuses if claim does not match connected wallet", async () => {
            const otherDemos = await newConnectedDemos()
            const otherClaim = demosClaimRefForAddress(
                await otherDemos.getEd25519Address(),
            )
            await expect(
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId: MEMBER,
                    claim: otherClaim,
                    demos,
                }),
            ).rejects.toThrow(/does not match/)
        })

        it("honours the provided boundAt", async () => {
            const at = 1700000000000
            const b = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
                boundAt: at,
            })
            expect(b.boundAt).toBe(at)
        })
    })

    describe("verifyMembershipBinding — tampering detection", () => {
        let baseline: L2PSMembershipBinding

        beforeAll(async () => {
            baseline = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
            })
        })

        it("accepts the untampered baseline", () => {
            expect(verifyMembershipBinding(baseline)).toBe(true)
        })

        it("rejects tampered channelId", () => {
            expect(
                verifyMembershipBinding({ ...baseline, channelId: "ch-evil" }),
            ).toBe(false)
        })

        it("rejects tampered subnetMemberId", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    subnetMemberId: "impostor",
                }),
            ).toBe(false)
        })

        it("rejects tampered boundAt", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    boundAt: baseline.boundAt + 1,
                }),
            ).toBe(false)
        })

        it("rejects swapped cciPrimaryClaim (different key)", async () => {
            const otherDemos = await newConnectedDemos()
            const otherClaim = demosClaimRefForAddress(
                await otherDemos.getEd25519Address(),
            )
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    cciPrimaryClaim: otherClaim,
                }),
            ).toBe(false)
        })

        it("rejects zero signature", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    signature: "0x" + "00".repeat(64),
                }),
            ).toBe(false)
        })

        it("rejects malformed signature hex", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    signature: "not-hex",
                }),
            ).toBe(false)
        })

        it("rejects unknown bindingVersion", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    bindingVersion: "2",
                } as unknown as L2PSMembershipBinding),
            ).toBe(false)
        })

        it("rejects non-demos claim scheme", () => {
            expect(
                verifyMembershipBinding({
                    ...baseline,
                    cciPrimaryClaim: "eip155:0xabcd",
                } as unknown as L2PSMembershipBinding),
            ).toBe(false)
        })

        it("rejects a binding lifted from a different channel", async () => {
            const otherChannel = await createMembershipBinding({
                channelId: "ch-OTHER",
                subnetMemberId: MEMBER,
                claim,
                demos,
            })
            const replayed: L2PSMembershipBinding = {
                ...otherChannel,
                channelId: CHANNEL,
            }
            expect(verifyMembershipBinding(replayed)).toBe(false)
        })
    })

    describe("hex helpers", () => {
        it("roundtrips Uint8Array -> hex -> Uint8Array", () => {
            const original = new Uint8Array(64)
            for (let i = 0; i < 64; i++) original[i] = i
            const hex = signatureToHex(original)
            const back = signatureFromHex(hex)
            expect(Buffer.from(back).equals(Buffer.from(original))).toBe(true)
            expect(hex.length).toBe(2 + 64 * 2)
        })

        it("signatureFromHex accepts both 0x-prefixed and bare hex", () => {
            const a = signatureFromHex("0xab")
            const b = signatureFromHex("ab")
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
        })

        it("signatureFromHex rejects non-hex characters", () => {
            expect(() => signatureFromHex("0xzz")).toThrow()
        })

        it("signatureFromHex rejects odd-length hex", () => {
            expect(() => signatureFromHex("abc")).toThrow()
        })
    })

    describe("stripBindingSignature", () => {
        it("removes the signature field", async () => {
            const b = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
            })
            const stripped = stripBindingSignature(b)
            expect("signature" in stripped).toBe(false)
            expect(stripped.channelId).toBe(b.channelId)
            expect(stripped.cciPrimaryClaim).toBe(b.cciPrimaryClaim)
        })
    })

    describe("resolveMember — DoS resistance (P1 regression)", () => {
        // Regression for greptile P1 finding on resolveMember: a single
        // squatter publishing a malformed SP under our deterministic name
        // must not crash the resolver — it must be skipped so a legitimate
        // candidate further down the candidate list still resolves.
        const RPC = "https://rpc.test"

        afterEach(() => jest.restoreAllMocks())

        it("skips a candidate with a malformed sp.owner and keeps iterating", async () => {
            const valid = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
            })

            jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([
                { storageAddress: "stor-malformed", programName: "", encoding: "json", sizeBytes: 0, storageLocation: "onchain", createdAt: "", updatedAt: "" },
                { storageAddress: "stor-valid", programName: "", encoding: "json", sizeBytes: 0, storageLocation: "onchain", createdAt: "", updatedAt: "" },
            ] as any)

            jest.spyOn(StorageProgram, "getByAddress").mockImplementation(
                async (_rpc: string, addr: string) => {
                    if (addr === "stor-malformed") {
                        return {
                            storageAddress: addr,
                            owner: "not-a-hex-address",
                            programName: bindingProgramName(CHANNEL, MEMBER),
                            encoding: "json",
                            data: valid as unknown as Record<string, unknown>,
                            metadata: null,
                            storageLocation: "onchain",
                            sizeBytes: 0,
                            createdAt: "",
                            updatedAt: "",
                        } as any
                    }
                    if (addr === "stor-valid") {
                        const ownerHex = (await demos.getEd25519Address())
                            .toLowerCase()
                        return {
                            storageAddress: addr,
                            owner: ownerHex.startsWith("0x")
                                ? ownerHex
                                : "0x" + ownerHex,
                            programName: bindingProgramName(CHANNEL, MEMBER),
                            encoding: "json",
                            data: valid as unknown as Record<string, unknown>,
                            metadata: null,
                            storageLocation: "onchain",
                            sizeBytes: 0,
                            createdAt: "",
                            updatedAt: "",
                        } as any
                    }
                    return null
                },
            )

            // Pre-fix this throws inside normalizeDemosAddress(sp.owner).
            // Post-fix it returns the valid candidate's claim.
            const resolved = await resolveMember(CHANNEL, MEMBER, RPC)
            expect(resolved).toBe(claim)
        })

        it("returns null when EVERY candidate is malformed (no throws)", async () => {
            jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([
                { storageAddress: "stor-bad", programName: "", encoding: "json", sizeBytes: 0, storageLocation: "onchain", createdAt: "", updatedAt: "" },
            ] as any)
            jest.spyOn(StorageProgram, "getByAddress").mockResolvedValue({
                storageAddress: "stor-bad",
                owner: "not-hex",
                programName: bindingProgramName(CHANNEL, MEMBER),
                encoding: "json",
                data: { bogus: true } as Record<string, unknown>,
                metadata: null,
                storageLocation: "onchain",
                sizeBytes: 0,
                createdAt: "",
                updatedAt: "",
            } as any)

            await expect(
                resolveMember(CHANNEL, MEMBER, RPC),
            ).resolves.toBeNull()
        })
    })

    describe("bindingProgramName injectivity (CodeRabbit regression)", () => {
        // Regression for CodeRabbit finding on binding.ts:34. Without
        // percent-encoding the colon-separated layout `("a:b","c")` and
        // `("a","b:c")` collided on the same SP name.
        it("does not collide when channelId or subnetMemberId contains a colon", () => {
            const a = bindingProgramName("a:b", "c")
            const b = bindingProgramName("a", "b:c")
            expect(a).not.toBe(b)
        })

        it("preserves backward-compat for ids without special chars", () => {
            expect(bindingProgramName("ch-1", "mem-2")).toBe(
                "l2ps-binding:ch-1:mem-2",
            )
        })
    })

    describe("boundAt validation (CodeRabbit regression)", () => {
        it("createMembershipBinding refuses a negative boundAt", async () => {
            await expect(
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId: MEMBER,
                    claim,
                    demos,
                    boundAt: -1,
                }),
            ).rejects.toThrow(/boundAt/)
        })

        it("createMembershipBinding refuses a non-integer boundAt", async () => {
            await expect(
                createMembershipBinding({
                    channelId: CHANNEL,
                    subnetMemberId: MEMBER,
                    claim,
                    demos,
                    boundAt: 1.5,
                }),
            ).rejects.toThrow(/boundAt/)
        })

        it("verifyMembershipBinding rejects a binding whose boundAt was clobbered to NaN at rest", async () => {
            const ok = await createMembershipBinding({
                channelId: CHANNEL,
                subnetMemberId: MEMBER,
                claim,
                demos,
            })
            const clobbered = {
                ...ok,
                boundAt: Number.NaN,
            } as unknown as L2PSMembershipBinding
            expect(verifyMembershipBinding(clobbered)).toBe(false)
        })
    })
})
