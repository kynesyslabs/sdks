/**
 * DACS-2 (Vet) conformance mapping.
 *
 * The vLEI verifier is a DACS-2 vet *method*: GLEIF/vLEI is an "authoritative
 * source" (DACS-2-VET §1), so verifying a vLEI chain to the GLEIF root is a
 * recipe (`vlei-agent-authority`). Its uniform output is a **VerifyResult**
 * (§7.5); a DACS-2 orchestrator (`vet-credentials`) aggregates VerifyResults into
 * a CompositeVerificationRecord (§7.7) — that aggregation is NOT our concern here.
 *
 * This module maps a `VleiVerdict` → a signed DACS-2 `VerifyResult`, and builds
 * the §7.5.2 `AttestationRef` from an on-chain anchor. Signatures use the DACS
 * ComponentSignature envelope (§DACS-4 / CORE §B.7 SIG-6): unpadded Base64URL over
 * `"dacs-verifyresult:v1:" || hex(sha256(JCS(result_without_signature)))`.
 *
 * Conformance notes (validate against `DACS-Standard/conformance` before relying
 * on byte-equality): (1) DACS has no KERI/ACDC method kind — we map to the closest
 * existing `verifiable-credential` (issuer = the GLEIF root); a dedicated `keri`
 * kind would be a spec-steward extension. (2) `scheme: "vlei"` presumes a DACS-1
 * claim-scheme registration for LEIs. (3) `data` carries only public GLEIF facts +
 * predicate outcomes (§7.5 public-anchor minimisation; GLEIF data is exempt, §7.5).
 */
import { sha256 } from "@noble/hashes/sha2"
import {
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import { jcsCanonicalize } from "./jcs"
import { bytesToHex } from "./hex"
import { canonicalDigest } from "./canonical"
import type { AnchorAttestationResult } from "./anchor"
import type { VleiAttestation, VleiVerdict } from "./types"

export const VERIFYRESULT_DOMAIN_PREFIX = "dacs-verifyresult:v1:"

/** The recipe family this verifier implements. */
export const VLEI_RECIPE = { id: "vlei-agent-authority", version: 1 } as const

/** DACS-2 §7.5.2 AttestationRef — a reference to an anchored attestation. */
export interface AttestationRef {
    anchor: { kind: "storage-program" | "ipfs" | "https"; locator: string }
    /** sha256 of the anchored content's RFC 8785 canonical form (hex). */
    contentHash: string
    signer?: ClaimReference
}

/** DACS ComponentSignature envelope (§DACS-4). */
export interface VerifyResultSignature {
    algorithm: "ed25519"
    signer: ClaimReference
    /** Unpadded Base64URL signature (CORE §B.7 SIG-6). */
    value: string
}

/** DACS-2 §7.5 VerifyResult — the uniform per-recipe output. */
export interface VerifyResult {
    resultVersion: "1"
    scheme: string
    identifier: string
    recipeVersion: number
    method: "verifiable-credential"
    decision: "pass" | "fail" | "indeterminate" | "error"
    reason: string
    attestation: AttestationRef
    data?: Record<string, unknown>
    fetchedAt: number
    verifiedAt: number
    validUntil?: number
    signature?: VerifyResultSignature
}

/** Build the §7.5.2 AttestationRef for an anchored attestation. */
export function attestationRefFor(
    att: VleiAttestation,
    anchor: Pick<AnchorAttestationResult, "storageAddress">,
): AttestationRef {
    return {
        anchor: { kind: "storage-program", locator: anchor.storageAddress },
        contentHash: canonicalDigest(att), // sha256(JCS(anchored attestation)), matches §7.5.2 step 2
        signer: att.attesterClaim,
    }
}

/** Map a verdict's outcome to a DACS-2 decision (§7.5.1 semantics). */
function decisionOf(v: VleiVerdict): { decision: VerifyResult["decision"]; reason: string } {
    if (v.ok) return { decision: "pass", reason: "vLEI chain verified to the trusted GLEIF root" }
    // A transport/resolution failure is `error` (verifier never reached a decision);
    // a clean contradiction (wrong root, revoked, out-of-scope) is `fail`.
    const transport = v.reasons.find(r => r.includes("unresolvable") || r.includes("fail-closed"))
    if (transport) return { decision: "error", reason: transport }
    return { decision: "fail", reason: v.reasons[0] ?? "verification failed" }
}

/** Public (GLEIF) identifiers + predicate outcomes only — §7.5 public-anchor minimisation. */
function publicData(v: VleiVerdict): Record<string, unknown> {
    const lei = v.chain.find(n => n.schemaName === "LE")?.attributes?.LEI
    const data: Record<string, unknown> = {
        legalEntityVerified: v.reachedRoot && v.chain.every(n => n.status === "0"),
    }
    if (lei) data.lei = lei
    if (v.delegation) data.agentAuthorityValid = v.delegation.ok
    if (v.delegation) data.agentAid = v.delegation.agentAid
    if (v.accountableOfficer) data.accountableOfficer = v.accountableOfficer
    if (v.scope) data.scopeOk = v.scope.ok
    data.recordDigest = v.recordDigest
    return data
}

export interface ToVerifyResultOpts {
    /**
     * The LEI being vetted — the requested claim identifier (from the listing's
     * ClaimRequirement). Falls back to the chain's LE node, but on an `error`
     * decision the chain may be empty, so the caller SHOULD pass it.
     */
    subjectLei?: string
    /** unix ms the authority (KERIA) was queried; defaults to `verifiedAt`. */
    fetchedAt?: number
    /** unix ms the result was finalised; defaults to Date.now(). */
    verifiedAt?: number
    validUntil?: number
}

/**
 * Map a `VleiVerdict` (+ its anchored AttestationRef) to an unsigned DACS-2
 * `VerifyResult`. `scheme`/`identifier` name the vLEI legal-entity claim vetted.
 */
export function toVerifyResult(
    verdict: VleiVerdict,
    attestation: AttestationRef,
    opts: ToVerifyResultOpts = {},
): VerifyResult {
    const lei = opts.subjectLei ?? verdict.chain.find(n => n.schemaName === "LE")?.attributes?.LEI
    if (!lei) throw new Error("toVerifyResult: no LEI — pass opts.subjectLei (the claim being vetted)")
    const { decision, reason } = decisionOf(verdict)
    const verifiedAt = opts.verifiedAt ?? Date.now()

    const vr: VerifyResult = {
        resultVersion: "1",
        scheme: "vlei",
        identifier: lei,
        recipeVersion: VLEI_RECIPE.version,
        method: "verifiable-credential",
        decision,
        reason,
        attestation,
        data: publicData(verdict),
        fetchedAt: opts.fetchedAt ?? verifiedAt,
        verifiedAt,
    }
    if (opts.validUntil !== undefined) vr.validUntil = opts.validUntil
    return vr
}

function stripSig(vr: VerifyResult): Omit<VerifyResult, "signature"> {
    const { signature: _signature, ...rest } = vr
    return rest
}

/** Bytes the VerifyResult signature covers: `dacs-verifyresult:v1:` || hex(sha256(JCS(vr − sig))). */
export function verifyResultSigningBytes(vr: VerifyResult): Uint8Array {
    const hash = bytesToHex(sha256(new TextEncoder().encode(jcsCanonicalize(stripSig(vr)))))
    return new TextEncoder().encode(VERIFYRESULT_DOMAIN_PREFIX + hash)
}

/** Sign a VerifyResult with the verifier's Demos (CCI primary) key. */
export async function signVerifyResult(vr: VerifyResult, signer: ClaimReference, demos: Demos): Promise<VerifyResult> {
    const sig = await signWithPrimaryClaim(signer, verifyResultSigningBytes(vr), demos)
    return {
        ...vr,
        signature: { algorithm: "ed25519", signer, value: Buffer.from(sig).toString("base64url") },
    }
}

/** Verify a VerifyResult's ComponentSignature. Returns false (not throws) on any problem. */
export function verifyVerifyResultSignature(vr: VerifyResult): boolean {
    const s = vr.signature
    if (!s || s.algorithm !== "ed25519" || !s.signer || typeof s.value !== "string") return false
    try {
        const sig = new Uint8Array(Buffer.from(s.value, "base64url"))
        return verifyPrimaryClaimSignature(s.signer, verifyResultSigningBytes(vr), sig)
    } catch {
        return false
    }
}
