import { Demos, DemosWebAuth } from "@/websdk"
import { demosClaimRefForAddress, type ClaimReference } from "@/identity/cci"
import { StorageProgram } from "@/storage/StorageProgram"
import {
    AGENT_AUTHORITY_SCHEMA,
    VLEI_SCHEMAS,
    ATTESTATION_DOMAIN_PREFIX,
    attestationProgramName,
    attestationSigningBytes,
    buildAttestation,
    resolveAttestation,
    signAttestation,
    txDigest,
    verifyAttestation,
    verifyChain,
    attestationRefFor,
    toVerifyResult,
    signVerifyResult,
    verifyVerifyResultSignature,
    verifyResultSigningBytes,
    type AttestationRef,
    type ProposedTx,
    type VleiAttestation,
    type VleiCredential,
    type VleiCredentialSource,
    type VleiKeyState,
    type VleiVerdict,
} from "@/identity/vlei"

// ── Synthetic KERI identities + a real vLEI chain (agent-authority) ──────────
const aid = (c: string) => `E${c.repeat(43)}`
const GLEIF_ROOT = aid("G")
const QVI_AID = aid("Q")
const LE_AID = aid("L")
const AGENT_AID = aid("A")
const OFFICER_AID = aid("O")
const LE_LEI = "875500ELOZEL05BVXV37"
const QVI_LEI = "254900OPPU84GM83MG36"

const QVI_SAID = "EqviSaid"
const LE_SAID = "EleSaid"
const AA_SAID = "EaaSaid"

const AUTHORITY_SCOPE = {
    transactionTypes: ["treasury-payment", "fx-spot"],
    corridors: ["EUR-USD", "EUR-SEK"],
    perTransactionLimit: { amount: "1000000", currency: "USD" },
    relyingNetworks: ["demos-testnet"],
}
const IN_SCOPE_TX: ProposedTx = {
    type: "treasury-payment",
    corridor: "EUR-USD",
    amount: "250000",
    currency: "USD",
    network: "demos-testnet",
}
const FIXED_TS = "2026-01-01T00:00:00.000Z"

function baseCreds(): Record<string, VleiCredential> {
    return {
        [QVI_SAID]: { sad: { d: QVI_SAID, s: VLEI_SCHEMAS.QVI, i: GLEIF_ROOT, a: { i: QVI_AID, LEI: QVI_LEI } }, status: { s: "0" } },
        [LE_SAID]: { sad: { d: LE_SAID, s: VLEI_SCHEMAS.LE, i: QVI_AID, a: { i: LE_AID, LEI: LE_LEI }, e: { qvi: { n: QVI_SAID } } }, status: { s: "0" } },
        [AA_SAID]: { sad: { d: AA_SAID, s: AGENT_AUTHORITY_SCHEMA, i: LE_AID, a: { i: AGENT_AID, authorityScope: AUTHORITY_SCOPE, accountableOfficer: OFFICER_AID }, e: { le: { n: LE_SAID } } }, status: { s: "0" } },
    }
}
const KEY_STATES: Record<string, VleiKeyState> = {
    [GLEIF_ROOT]: { d: "ksG" },
    [QVI_AID]: { d: "ksQVI" },
    [LE_AID]: { d: "ksLE" },
    [AGENT_AID]: { d: "ksA", di: LE_AID }, // delegated by LE → delegation ok
}

function mockSource(creds: Record<string, VleiCredential>): VleiCredentialSource {
    return {
        async getCredential(said) {
            const c = creds[said]
            if (!c) throw new Error(`mockSource: unresolvable ${said}`)
            return c
        },
        async getKeyState(a) {
            return KEY_STATES[a]
        },
    }
}

async function newConnectedDemos(): Promise<Demos> {
    const auth = new DemosWebAuth()
    await auth.create()
    const d = new Demos()
    await d.connectWallet(auth.keypair.privateKey as Uint8Array)
    return d
}

const keyControl = (tx: ProposedTx) => ({
    agentAid: AGENT_AID,
    ok: true,
    challengeDigest: "ch".repeat(16),
    boundTxDigest: txDigest(tx),
})

describe("vLEI verifyChain (injected source)", () => {
    it("passes a valid agent-authority chain to the trusted root", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, {
            proposedTx: IN_SCOPE_TX,
            keyControl: keyControl(IN_SCOPE_TX),
            timestamp: FIXED_TS,
        })
        expect(v.ok).toBe(true)
        expect(v.reachedRoot).toBe(true)
        expect(v.reasons).toEqual([])
        expect(v.delegation?.ok).toBe(true)
        expect(v.scope?.ok).toBe(true)
        expect(v.keyControl?.boundToTx).toBe(true)
        expect(v.chain.map(n => n.schemaName)).toEqual(["AGENT_AUTHORITY", "LE", "QVI"])
    })

    it("fails against a WRONG trusted root", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, aid("Z"), { timestamp: FIXED_TS })
        expect(v.ok).toBe(false)
        expect(v.reachedRoot).toBe(false)
    })

    it("fails closed on a revoked credential (TEL status 1)", async () => {
        const creds = baseCreds()
        creds[LE_SAID].status = { s: "1" }
        const v = await verifyChain(mockSource(creds), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        expect(v.ok).toBe(false)
        expect(v.reasons.some(r => r.includes("status=1"))).toBe(true)
    })

    it("rejects an over-limit tx via authorityScope", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, {
            proposedTx: { ...IN_SCOPE_TX, amount: "9999999" },
            timestamp: FIXED_TS,
        })
        expect(v.ok).toBe(false)
        expect(v.scope?.ok).toBe(false)
    })

    it("rejects a replayed key-control proof (bound to a different tx)", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, {
            proposedTx: { ...IN_SCOPE_TX, amount: "500000" },
            keyControl: keyControl(IN_SCOPE_TX), // bound to the 250000 tx
            timestamp: FIXED_TS,
        })
        expect(v.ok).toBe(false)
        expect(v.keyControl?.boundToTx).toBe(false)
    })

    it("is deterministic — same inputs, same recordDigest", async () => {
        const a = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const b = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        expect(a.recordDigest).toBe(b.recordDigest)
    })
})

describe("vLEI attestation (build / sign / verify)", () => {
    let demos: Demos
    let attesterClaim: ClaimReference
    let verdict: VleiVerdict

    beforeAll(async () => {
        demos = await newConnectedDemos()
        attesterClaim = demosClaimRefForAddress(await demos.getEd25519Address())
        verdict = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, {
            proposedTx: IN_SCOPE_TX,
            keyControl: keyControl(IN_SCOPE_TX),
            timestamp: FIXED_TS,
        })
    })

    it("signing bytes carry the domain prefix and a 64-char digest", () => {
        const unsigned = buildAttestation(verdict, attesterClaim, { boundAt: 1700000000000 })
        const str = new TextDecoder().decode(attestationSigningBytes(unsigned))
        expect(str.startsWith(ATTESTATION_DOMAIN_PREFIX)).toBe(true)
        expect(str.length).toBe(ATTESTATION_DOMAIN_PREFIX.length + 64)
    })

    it("builds a signed positive attestation that verifies", async () => {
        const att = await signAttestation(buildAttestation(verdict, attesterClaim, { boundAt: 1700000000000 }), demos)
        expect(att.subjectClaim).toBe(`vlei:${LE_LEI}`)
        expect(att.agentClaim).toBe(`keri:${AGENT_AID}`)
        expect(att.attesterClaim).toBe(attesterClaim)
        expect(att.verified).toBe(true)
        expect(att.scopeOk).toBe(true)
        expect(att.txDigest).toBe(txDigest(IN_SCOPE_TX))
        expect(att.signature.startsWith("0x")).toBe(true)
        expect(verifyAttestation(att)).toBe(true)
        // digest-only: no raw credential contents leak into the attestation
        expect(JSON.stringify(att)).not.toContain("authorityScope")
        expect(JSON.stringify(att)).not.toContain("personLegalName")
    })

    it("rejects a demos-scheme mismatch on attesterClaim", () => {
        expect(() => buildAttestation(verdict, "eip155:0x1234" as ClaimReference)).toThrow(/demos:/)
    })

    describe("tamper detection", () => {
        let att: VleiAttestation
        beforeAll(async () => {
            att = await signAttestation(buildAttestation(verdict, attesterClaim, { boundAt: 1700000000000 }), demos)
        })
        it("accepts the untampered baseline", () => expect(verifyAttestation(att)).toBe(true))
        it("rejects tampered subjectClaim", () => expect(verifyAttestation({ ...att, subjectClaim: "vlei:000000000000000000FF" })).toBe(false))
        it("rejects tampered recordDigest", () => expect(verifyAttestation({ ...att, recordDigest: "deadbeef" })).toBe(false))
        it("rejects a flipped verified flag", () => expect(verifyAttestation({ ...att, verified: !att.verified })).toBe(false))
        it("rejects tampered boundAt", () => expect(verifyAttestation({ ...att, boundAt: att.boundAt + 1 })).toBe(false))
        it("rejects a swapped attesterClaim (different key)", async () => {
            const other = await newConnectedDemos()
            const otherClaim = demosClaimRefForAddress(await other.getEd25519Address())
            expect(verifyAttestation({ ...att, attesterClaim: otherClaim })).toBe(false)
        })
        it("rejects a zero signature", () => expect(verifyAttestation({ ...att, signature: "0x" + "00".repeat(64) })).toBe(false))
    })

    it("builds a valid NEGATIVE attestation from a failed verdict", async () => {
        const failed = await verifyChain(mockSource(baseCreds()), AA_SAID, aid("Z"), { timestamp: FIXED_TS })
        expect(failed.ok).toBe(false)
        const att = await signAttestation(buildAttestation(failed, attesterClaim, { boundAt: 1700000000000 }), demos)
        expect(att.verified).toBe(false)
        expect(verifyAttestation(att)).toBe(true)
    })
})

describe("attestationProgramName injectivity", () => {
    it("does not collide when subjectClaim or recordDigest contains a colon", () => {
        expect(attestationProgramName("vlei:a:b" as ClaimReference, "c")).not.toBe(
            attestationProgramName("vlei:a" as ClaimReference, "b:c"),
        )
    })
})

describe("resolveAttestation (mocked substrate)", () => {
    const RPC = "https://rpc.test"
    let demos: Demos
    let attesterClaim: ClaimReference
    let att: VleiAttestation

    beforeAll(async () => {
        demos = await newConnectedDemos()
        attesterClaim = demosClaimRefForAddress(await demos.getEd25519Address())
        const verdict = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        att = await signAttestation(buildAttestation(verdict, attesterClaim, { boundAt: 1700000000000 }), demos)
    })
    afterEach(() => jest.restoreAllMocks())

    const spItem = (storageAddress: string) => ({ storageAddress, programName: "", encoding: "json", sizeBytes: 0, storageLocation: "onchain", createdAt: "", updatedAt: "" })
    const spRecord = (owner: string, data: Record<string, unknown>) => ({ storageAddress: "x", owner, programName: "", encoding: "json", data, metadata: null, storageLocation: "onchain", sizeBytes: 0, createdAt: "", updatedAt: "" })

    it("returns the anchored attestation when signature + owner check pass", async () => {
        const ownerHex = await demos.getEd25519Address()
        jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([spItem("stor-valid")] as any)
        jest.spyOn(StorageProgram, "getByAddress").mockResolvedValue(spRecord(ownerHex, att as unknown as Record<string, unknown>) as any)
        const resolved = await resolveAttestation(att.subjectClaim, att.recordDigest, RPC)
        expect(resolved?.subjectClaim).toBe(att.subjectClaim)
    })

    it("rejects a candidate whose SP owner is not the attester", async () => {
        const other = await newConnectedDemos()
        jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([spItem("stor-impostor")] as any)
        jest.spyOn(StorageProgram, "getByAddress").mockResolvedValue(spRecord(await other.getEd25519Address(), att as unknown as Record<string, unknown>) as any)
        const resolved = await resolveAttestation(att.subjectClaim, att.recordDigest, RPC)
        expect(resolved).toBeNull()
    })

    it("skips a malformed candidate and keeps iterating (DoS resistance)", async () => {
        const ownerHex = await demos.getEd25519Address()
        jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([spItem("stor-bad"), spItem("stor-good")] as any)
        jest.spyOn(StorageProgram, "getByAddress").mockImplementation(async (_rpc: string, addr: string) => {
            if (addr === "stor-bad") return spRecord("not-a-hex-address", att as unknown as Record<string, unknown>) as any
            return spRecord(ownerHex, att as unknown as Record<string, unknown>) as any
        })
        const resolved = await resolveAttestation(att.subjectClaim, att.recordDigest, RPC)
        expect(resolved?.subjectClaim).toBe(att.subjectClaim)
    })

    it("returns null when no candidate exists", async () => {
        jest.spyOn(StorageProgram, "searchByName").mockResolvedValue([] as any)
        await expect(resolveAttestation(att.subjectClaim, att.recordDigest, RPC)).resolves.toBeNull()
    })
})

describe("DACS-2 VerifyResult mapping (vet recipe output)", () => {
    let demos: Demos
    let attesterClaim: ClaimReference
    const ref: AttestationRef = {
        anchor: { kind: "storage-program", locator: "0xSTORAGE" },
        contentHash: "a".repeat(64),
    }

    beforeAll(async () => {
        demos = await newConnectedDemos()
        attesterClaim = demosClaimRefForAddress(await demos.getEd25519Address())
    })

    it("maps a passing verdict to a DACS-2 VerifyResult (§7.5)", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const vr = toVerifyResult(v, ref, { verifiedAt: 1700000000000 })
        expect(vr.resultVersion).toBe("1")
        expect(vr.scheme).toBe("vlei")
        expect(vr.identifier).toBe(LE_LEI)
        expect(vr.method).toBe("verifiable-credential")
        expect(vr.decision).toBe("pass")
        expect(vr.data?.lei).toBe(LE_LEI)
        expect(vr.data?.agentAuthorityValid).toBe(true)
        expect(vr.data?.scopeOk).toBe(true)
        // §7.5 public-anchor minimisation: predicate outcomes + public GLEIF data only
        expect(JSON.stringify(vr.data)).not.toContain("authorityScope")
        expect(JSON.stringify(vr.data)).not.toContain("personLegalName")
    })

    it("maps a wrong-root verdict to decision 'fail'", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, aid("Z"), { timestamp: FIXED_TS })
        expect(toVerifyResult(v, ref, { verifiedAt: 1700000000000 }).decision).toBe("fail")
    })

    it("maps an unresolvable-leaf verdict to decision 'error'", async () => {
        const v = await verifyChain(mockSource({}), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        // chain is empty on a transport error → the caller supplies the vetted LEI
        expect(toVerifyResult(v, ref, { verifiedAt: 1700000000000, subjectLei: LE_LEI }).decision).toBe("error")
    })

    it("signs + verifies the VerifyResult (dacs-verifyresult:v1, Base64URL)", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        const vr = toVerifyResult(v, ref, { verifiedAt: 1700000000000 })
        const signed = await signVerifyResult(vr, attesterClaim, demos)
        expect(signed.signature?.algorithm).toBe("ed25519")
        expect(signed.signature?.signer).toBe(attesterClaim)
        expect(signed.signature?.value).not.toMatch(/[+/=]/) // Base64URL, unpadded
        expect(verifyVerifyResultSignature(signed)).toBe(true)
        // tamper the decision → signature no longer verifies
        expect(verifyVerifyResultSignature({ ...signed, decision: "fail" })).toBe(false)
    })

    it("attestationRefFor builds a §7.5.2 storage-program ref", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        const signedAtt = await signAttestation(buildAttestation(v, attesterClaim, { boundAt: 1700000000000 }), demos)
        const r = attestationRefFor(signedAtt, { storageAddress: "0xABC" })
        expect(r.anchor).toEqual({ kind: "storage-program", locator: "0xABC" })
        expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/)
        expect(r.signer).toBe(attesterClaim)
    })

    // Conformance vs DACS-Standard/conformance goldens (read at authoring time):
    it("VerifyResult field set matches the §7.5 golden shape", async () => {
        // vectors/security/claim-requirement-qualification-v0.3.json golden keys
        const golden = new Set([
            "resultVersion", "scheme", "identifier", "recipeVersion", "method",
            "decision", "reason", "attestation", "data", "fetchedAt", "verifiedAt",
            "validUntil", "signature",
        ])
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const vr = await signVerifyResult(
            toVerifyResult(v, ref, { verifiedAt: 1700000000000, validUntil: 1700000060000 }),
            attesterClaim,
            demos,
        )
        for (const k of Object.keys(vr)) expect(golden.has(k)).toBe(true)
        // AttestationRef nested shape (§7.5.2)
        expect(Object.keys(vr.attestation).sort()).toEqual(["anchor", "contentHash"].sort())
        expect(Object.keys(vr.attestation.anchor).sort()).toEqual(["kind", "locator"])
        expect(Object.keys(vr.signature!).sort()).toEqual(["algorithm", "signer", "value"])
    })

    it("canonical form is NFC-normalised (CORE §B.2 CF-1)", async () => {
        // Same legal name, precomposed (NFC) vs decomposed (NFD) — must hash identically.
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        const base = toVerifyResult(v, ref, { verifiedAt: 1700000000000 })
        const precomposed = { ...base, data: { ...base.data, legalName: "M\u00FCller GmbH" } } // U+00FC
        const decomposed = { ...base, data: { ...base.data, legalName: "Mu\u0308ller GmbH" } } // u + U+0308
        expect(precomposed.data!.legalName).not.toBe(decomposed.data!.legalName) // different bytes in
        const a = Buffer.from(verifyResultSigningBytes(precomposed)).toString()
        const b = Buffer.from(verifyResultSigningBytes(decomposed)).toString()
        expect(a).toBe(b) // ...identical canonical/signing bytes out
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// DACS conformance — checked against DACS-Standard/conformance goldens.
// AttestationRef cases vendored verbatim from
// vectors/security/artifact-reference-shapes-v0.1 (set hash
// 155ef1e2ab1aa0dbb4dba23d1e1ee20b854bab8034029b4ebd0c87ad4014f858); re-vendor
// if §7.5.2 changes. Contents are 32-byte hex placeholders, so 64 'a'/'b'/… is
// the golden's own value, not a stand-in.
// ─────────────────────────────────────────────────────────────────────────────
describe("DACS conformance (§7.5.2 AttestationRef / §7.5 VerifyResult)", () => {
    // The closed VerificationMethod registry (DACS-2-VET §7).
    const DACS2_METHOD_KINDS = new Set([
        "verifiable-credential", "tlsnotary", "zktls", "consensus-backed-proxy",
        "oauth-attested", "evm-rpc", "domain-tls-control", "self-signed", "demos-gcr-domain",
    ])

    const GOLDEN_ATTESTATION_REFS: Array<{ name: string; expected: "pass" | "fail"; value: unknown }> = [
        { name: "storage-program", expected: "pass", value: { anchor: { kind: "storage-program", locator: "dacs4:evidence:job-308:rail:0" }, contentHash: "a".repeat(64), signer: "did:demos:orchestrator" } },
        { name: "ipfs", expected: "pass", value: { anchor: { kind: "ipfs", locator: "bafybeigdyrzt" }, contentHash: "b".repeat(64) } },
        { name: "https", expected: "pass", value: { anchor: { kind: "https", locator: "https://example.test/dacs/evidence/308" }, contentHash: "c".repeat(64) } },
        { name: "legacy-flat-kind-id-rejected", expected: "fail", value: { kind: "dacs-4-evidence", name: "evidence-job-308", contentHash: "d".repeat(64) } },
    ]

    const ATTESTATION_ANCHOR_KINDS = new Set(["storage-program", "ipfs", "https"])
    // §7.5.2 wire shape: exactly { anchor:{kind,locator}, contentHash, signer? } —
    // the legacy flat { kind, name, contentHash } MUST NOT satisfy it.
    function isValidAttestationRef(v: unknown): boolean {
        if (typeof v !== "object" || v === null) return false
        const o = v as Record<string, unknown>
        if (!Object.keys(o).every(k => k === "anchor" || k === "contentHash" || k === "signer")) return false
        if (typeof o.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(o.contentHash)) return false
        if ("signer" in o && typeof o.signer !== "string") return false
        if (typeof o.anchor !== "object" || o.anchor === null) return false
        const a = o.anchor as Record<string, unknown>
        if (Object.keys(a).sort().join(",") !== "kind,locator") return false
        return ATTESTATION_ANCHOR_KINDS.has(a.kind as string) && typeof a.locator === "string" && a.locator.length > 0
    }

    let demos: Demos
    let attesterClaim: ClaimReference
    const anchoredRef = async (v: VleiVerdict) =>
        attestationRefFor(await signAttestation(buildAttestation(v, attesterClaim, { boundAt: 1700000000000 }), demos), { storageAddress: "dacs:stor:0xABC" })

    beforeAll(async () => {
        demos = await newConnectedDemos()
        attesterClaim = demosClaimRefForAddress(await demos.getEd25519Address())
    })

    it.each(GOLDEN_ATTESTATION_REFS)("golden AttestationRef $name → $expected", ({ expected, value }) => {
        expect(isValidAttestationRef(value)).toBe(expected === "pass")
    })

    it("attestationRefFor emits the §7.5.2 shape, not the rejected legacy flat one", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const ref = await anchoredRef(v)
        expect(isValidAttestationRef(ref)).toBe(true)
        expect(ref.anchor.kind).toBe("storage-program")
        expect(ref).not.toHaveProperty("name") // legacy shape markers absent
        expect(ref).not.toHaveProperty("kind")
    })

    it("VerifyResult.method is a member of the closed DACS-2 method registry (§7)", async () => {
        const v = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const vr = toVerifyResult(v, await anchoredRef(v), { verifiedAt: 1700000000000 })
        expect(DACS2_METHOD_KINDS.has(vr.method)).toBe(true)
        expect(vr.method).toBe("verifiable-credential") // the §7.3.2 method for VC/vLEI claims
    })

    it("decision is one of the §7.5.1 four values across pass/fail/error paths", async () => {
        const FOUR = new Set(["pass", "fail", "indeterminate", "error"])
        const pass = await verifyChain(mockSource(baseCreds()), AA_SAID, GLEIF_ROOT, { proposedTx: IN_SCOPE_TX, timestamp: FIXED_TS })
        const fail = await verifyChain(mockSource(baseCreds()), AA_SAID, aid("Z"), { timestamp: FIXED_TS })
        const err = await verifyChain(mockSource({}), AA_SAID, GLEIF_ROOT, { timestamp: FIXED_TS })
        const ref = await anchoredRef(pass)
        expect(toVerifyResult(pass, ref, { verifiedAt: 1 }).decision).toBe("pass")
        expect(toVerifyResult(fail, ref, { verifiedAt: 1, subjectLei: LE_LEI }).decision).toBe("fail")
        expect(toVerifyResult(err, ref, { verifiedAt: 1, subjectLei: LE_LEI }).decision).toBe("error")
        for (const vd of [pass, fail, err]) {
            expect(FOUR.has(toVerifyResult(vd, ref, { verifiedAt: 1, subjectLei: LE_LEI }).decision)).toBe(true)
        }
    })
})
