import {
    isDemosClaim,
    verifyPrimaryClaimSignature,
    signWithPrimaryClaim,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import {
    attestationCommitment,
    attestationSigningBytes,
    canonicalDigest,
    signatureFromHex,
    signatureToHex,
    stripAttestationSignature,
} from "./canonical"
import { txDigest } from "./verify"
import type { UnsignedVleiAttestation, VleiAttestation, VleiVerdict } from "./types"

/** CCI claim constructors for the vLEI / KERI schemes. */
export const vleiClaim = (lei: string): ClaimReference => `vlei:${lei}`
export const keriClaim = (aid: string): ClaimReference => `keri:${aid}`

export { attestationCommitment }

export interface BuildAttestationOpts {
    /** Defaults to Date.now(). Provide for deterministic fixtures. */
    boundAt?: number
    /** Override the subject LEI if it cannot be read from the chain. */
    subjectLei?: string
}

/** Read the legal-entity LEI the attestation is about (prefer the LE node). */
function subjectLeiFromVerdict(v: VleiVerdict): string | undefined {
    const le = v.chain.find(n => n.schemaName === "LE")
    const anyLei = v.chain.find(n => typeof n.attributes?.LEI === "string")
    return (le?.attributes?.LEI as string | undefined) ?? (anyLei?.attributes?.LEI as string | undefined)
}

/** Compact, digest-only fingerprint of the verified chain (public identifiers). */
function chainDigestOf(v: VleiVerdict): string {
    const skeleton = v.chain.map(n => ({
        said: n.said,
        schema: n.schemaName ?? n.schema,
        issuer: n.issuer,
        status: n.status ?? "",
        edge: n.edgeName ?? "",
        edgeTo: n.edgeTo ?? "",
    }))
    return canonicalDigest(skeleton)
}

/**
 * Build an (unsigned) attestation from a verifier verdict. A FAILED verdict still
 * produces a well-formed, anchorable *negative* attestation (`verified:false`).
 * `attesterClaim` must be the attester's `demos:` claim (it signs the result).
 */
export function buildAttestation(
    v: VleiVerdict,
    attesterClaim: ClaimReference,
    opts: BuildAttestationOpts = {},
): UnsignedVleiAttestation {
    if (!isDemosClaim(attesterClaim)) {
        throw new Error(`buildAttestation: attesterClaim must be a "demos:..." ClaimReference, got "${attesterClaim}"`)
    }
    const lei = opts.subjectLei ?? subjectLeiFromVerdict(v)
    if (!lei) throw new Error("buildAttestation: no LEI found in the verified chain")

    const boundAt = opts.boundAt ?? Date.now()
    if (!Number.isSafeInteger(boundAt) || boundAt < 0) {
        throw new Error("buildAttestation: boundAt must be a non-negative safe-integer unix-ms timestamp")
    }

    const unsigned: UnsignedVleiAttestation = {
        attestationVersion: "1",
        subjectClaim: vleiClaim(lei),
        attesterClaim,
        recordDigest: v.recordDigest,
        chainDigest: chainDigestOf(v),
        verified: v.ok,
        reachedRoot: v.reachedRoot,
        boundAt,
    }
    if (v.delegation) unsigned.agentClaim = keriClaim(v.delegation.agentAid)
    if (v.delegation) unsigned.delegationOk = v.delegation.ok
    if (v.accountableOfficer) unsigned.accountableOfficer = v.accountableOfficer
    if (v.scope) {
        unsigned.scopeOk = v.scope.ok
        unsigned.txDigest = txDigest(v.scope.tx)
    }
    return unsigned
}

/** Sign an attestation with the attester's Demos (CCI primary) key. */
export async function signAttestation(
    unsigned: UnsignedVleiAttestation,
    demos: Demos,
): Promise<VleiAttestation> {
    const sig = await signWithPrimaryClaim(unsigned.attesterClaim, attestationSigningBytes(unsigned), demos)
    return { ...unsigned, signature: signatureToHex(sig) }
}

/**
 * Pure signature + structure check — no chain access. Verifies the embedded
 * signature against the Demos public key encoded in `attesterClaim`. Returns
 * `false` (not throws) on any structural problem so callers can use it as a filter.
 */
export function verifyAttestation(att: VleiAttestation): boolean {
    if (att?.attestationVersion !== "1") return false
    if (!att.subjectClaim || !att.attesterClaim) return false
    if (!isDemosClaim(att.attesterClaim)) return false
    if (typeof att.recordDigest !== "string" || !att.recordDigest) return false
    if (!Number.isSafeInteger(att.boundAt) || att.boundAt < 0) return false
    if (typeof att.signature !== "string" || !att.signature) return false

    try {
        const payload = attestationSigningBytes(stripAttestationSignature(att))
        const sig = signatureFromHex(att.signature)
        return verifyPrimaryClaimSignature(att.attesterClaim, payload, sig)
    } catch {
        return false
    }
}
