import type { ClaimReference } from "@/identity/cci"
import type { SchemaName } from "./schemas"

// ── Verifier verdict ────────────────────────────────────────────────────────

export interface ChainNode {
    said: string
    schema: string
    schemaName?: SchemaName
    issuer: string
    issuee?: string
    /** TEL status: "0" = issued, "1" = revoked. */
    status?: string
    edgeTo?: string
    edgeName?: string
    attributes?: Record<string, any>
}

/** A transaction the agent proposes, evaluated against the credential's scope. */
export interface ProposedTx {
    type: string
    corridor?: string
    amount?: string
    currency?: string
    network?: string
}

export interface DelegationCheck {
    agentAid: string
    delegator?: string
    expectedDelegator: string
    ok: boolean
}

/**
 * Proof that the agent controls its (delegated) signing key over a fresh,
 * per-session challenge. `boundTxDigest` ties the proof to one specific
 * transaction so a captured proof cannot be replayed for another.
 */
export interface KeyControlProof {
    agentAid: string
    ok: boolean
    challengeDigest: string
    responseSaid?: string
    boundTxDigest?: string
    reason?: string
}

export interface VleiVerdict {
    leaf: string
    ok: boolean
    reachedRoot: boolean
    reasons: string[]
    chain: ChainNode[]
    keyStateDigests: Record<string, string>
    delegation?: DelegationCheck
    /** The accountable human officer referenced by the agent-authority credential. */
    accountableOfficer?: string
    scope?: { tx: ProposedTx; ok: boolean; reasons: string[] }
    keyControl?: KeyControlProof & { boundToTx: boolean }
    timestamp: string
    /** sha256 over the canonical record — the digest an attestation anchors. */
    recordDigest: string
}

// ── Injected KERI transport ─────────────────────────────────────────────────
// The verifier reads credentials + key states through this interface so the SDK
// takes no hard dependency on a KERI client (signify-ts). A consumer supplies an
// adapter (e.g. backed by signify-ts `credentials()` / `keyStates()`).

/** Minimal ACDC shape the verifier reads. */
export interface VleiCredential {
    sad: {
        d: string
        s: string
        i: string
        a?: Record<string, any>
        e?: Record<string, { n: string; s?: string; o?: string }>
    }
    status?: { s?: string }
}

/** Minimal KERI key-state shape the verifier reads. */
export interface VleiKeyState {
    d?: string
    i?: string
    s?: string
    k?: string[]
    /** Delegator AID for a delegated identifier (KERI `di`). */
    di?: string
}

export interface VleiCredentialSource {
    /** Resolve an ACDC by SAID; MUST reject (throw) if it cannot be resolved (fail-closed). */
    getCredential(said: string): Promise<VleiCredential>
    /** Resolve an AID's current key state; may return a single state or an array (KERIA returns [state]). */
    getKeyState(aid: string): Promise<VleiKeyState | VleiKeyState[] | undefined>
}

// ── Attestation ─────────────────────────────────────────────────────────────

/**
 * A verifier's verdict, distilled to a signed, anchorable claim binding. Every
 * field is a public identifier or a digest — never credential contents. The
 * attester's Demos key signs it; the subject's `vlei:<LEI>` claim is what the
 * binding places in the subject's DACS-1 bundle.
 */
export interface UnsignedVleiAttestation {
    attestationVersion: "1"
    /** The legal entity this attestation backs — becomes the subject's CCI claim. */
    subjectClaim: ClaimReference
    /** The delegated agent AID, when the verdict covers an agent-authority credential. */
    agentClaim?: ClaimReference
    /** The attesting verifier's own `demos:` CCI claim (the key that signs this). */
    attesterClaim: ClaimReference
    /** The verifier's full-record digest — the only link back to the chain. */
    recordDigest: string
    /** Compact fingerprint over the chain's public SAIDs/AIDs/status. */
    chainDigest: string
    verified: boolean
    reachedRoot: boolean
    delegationOk?: boolean
    accountableOfficer?: string
    scopeOk?: boolean
    /** When the verdict evaluated a proposed tx: the digest authority was bound to. */
    txDigest?: string
    /** unix ms. */
    boundAt: number
}

export interface VleiAttestation extends UnsignedVleiAttestation {
    /** Hex (0x-prefixed) Ed25519 signature over `attestationSigningBytes`. */
    signature: string
}
