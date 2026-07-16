import {
    isDemosClaim,
    normalizeDemosAddress,
    parseClaimRef,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type {
    AgreementDocument,
    AgreementSignature,
    UnsignedAgreementDocument,
} from "@/l2ps/agreement/types"
import {
    agreementHashHex,
    agreementSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripAgreementSignatures,
} from "@/l2ps/agreement/canonical"

/**
 * Comparison key for a claim.
 *
 * The CCI signing helpers normalise a Demos address (0x-prefixed, lowercase)
 * before they touch a key, so two spellings of the same identity verify
 * identically. Set/`includes` checks on the raw string would not: `demos:0xAB…`
 * and `demos:0xab…` are the same party but different strings, and a legitimately
 * signed agreement would be rejected. Compare on this instead.
 *
 * Non-demos schemes and malformed claims fall back to the literal string — we
 * cannot know their normalisation, and a bad claim fails signature checks anyway.
 *
 * @param ref - The claim to normalise.
 * @returns A stable key safe to compare and to use in a Set.
 */
function claimKey(ref: ClaimReference): string {
    try {
        if (!isDemosClaim(ref)) return ref
        const { scheme, identifier } = parseClaimRef(ref)
        return `${scheme}:${normalizeDemosAddress(identifier)}`
    } catch {
        return ref
    }
}

/** True when `ref` is the same identity as one of `list`, spelling aside. */
function claimIn(list: ReadonlyArray<ClaimReference>, ref: ClaimReference): boolean {
    const k = claimKey(ref)
    return list.some((c) => claimKey(c) === k)
}

/**
 * Build the unsigned document shell.
 *
 * @param opts.channelId - The session the agreement was negotiated in.
 * @param opts.parties - Every identity that must co-sign.
 * @param opts.body - The agreed terms (impl-defined).
 * @param opts.agreedAt - Unix ms; defaults to now.
 * @param opts.refs - Optional back-references into the negotiation.
 * @returns The document without signatures.
 */
export function buildUnsignedAgreement(opts: {
    channelId: string
    parties: ClaimReference[]
    body: unknown
    agreedAt?: number
    refs?: AgreementDocument["refs"]
}): UnsignedAgreementDocument {
    if (!opts.channelId) throw new Error("buildUnsignedAgreement: channelId required")
    if (!opts.parties?.length)
        throw new Error("buildUnsignedAgreement: parties required")
    return {
        agreementVersion: "1",
        channelId: opts.channelId,
        parties: [...opts.parties],
        body: opts.body,
        agreedAt: opts.agreedAt ?? Date.now(),
        ...(opts.refs && { refs: opts.refs }),
    }
}

/**
 * Produce one party's co-signature, with the key controlling its CCI primary
 * claim — the same key that signed in-channel (SR-4 brief §0), never the RSA
 * subnet key.
 *
 * @param unsigned - The document to sign.
 * @param signer - The signing party's claim; must be one of `unsigned.parties`.
 * @param demos - A connected Demos whose address controls `signer`.
 * @returns The party's signature over the canonical bytes.
 * @throws If `signer` is not a demos claim or is not a party.
 */
export async function signAgreement(
    unsigned: UnsignedAgreementDocument,
    signer: ClaimReference,
    demos: Demos,
): Promise<AgreementSignature> {
    if (!isDemosClaim(signer))
        throw new Error(
            `signAgreement: signer must be a demos: ClaimReference, got "${signer}"`,
        )
    if (!claimIn(unsigned.parties, signer))
        throw new Error(
            `signAgreement: "${signer}" is not a party to this agreement`,
        )
    const sigBytes = await signWithPrimaryClaim(
        signer,
        agreementSigningBytes(unsigned),
        demos,
    )
    return { sigVersion: "1", signer, signature: signatureToHex(sigBytes) }
}

/**
 * Assemble the committed document: every party signs the same canonical bytes.
 *
 * Refuses to hand back a document unless `signers` covers every party exactly
 * once. A partially-signed document is not a committed agreement — returning
 * one would hand the caller something that looks committed and binds nobody.
 *
 * @param opts.signers - Exactly one entry per party, in signature order.
 * @returns The fully co-signed document.
 * @throws If a signer is not a party, is duplicated, or a party is missing.
 */
export async function coSignAgreement(opts: {
    channelId: string
    parties: ClaimReference[]
    body: unknown
    signers: Array<{ claim: ClaimReference; demos: Demos }>
    agreedAt?: number
    refs?: AgreementDocument["refs"]
}): Promise<AgreementDocument> {
    const unsigned = buildUnsignedAgreement(opts)

    const seen = new Set<string>()
    for (const s of opts.signers ?? []) {
        const k = claimKey(s.claim)
        if (seen.has(k))
            throw new Error(`coSignAgreement: duplicate signer "${s.claim}"`)
        seen.add(k)
    }
    for (const p of unsigned.parties) {
        if (!seen.has(claimKey(p)))
            throw new Error(
                `coSignAgreement: no signer for party "${p}" — a partially-signed document is not an agreement`,
            )
    }

    const signatures: AgreementSignature[] = []
    for (const s of opts.signers) {
        signatures.push(await signAgreement(unsigned, s.claim, s.demos))
    }
    return { ...unsigned, signatures }
}

/**
 * The anchorable identity of a document — recomputed from its bytes.
 *
 * @param doc - The signed document.
 * @returns Lowercase hex sha256 of the canonical bytes.
 * @throws If the document cannot be canonicalised (see `agreementHashHex`).
 */
export function agreementHash(doc: AgreementDocument): string {
    return agreementHashHex(stripAgreementSignatures(doc))
}

export interface AgreementVerificationResult {
    ok: boolean
    errors: string[]
}

/** Shape checks that must pass before anything else is worth doing. */
function checkShape(doc: AgreementDocument, errors: string[]): boolean {
    if (doc?.agreementVersion !== "1") {
        errors.push("agreementVersion is not 1")
        return false
    }
    if (!doc.channelId) errors.push("missing channelId")
    if (!doc.parties?.length) errors.push("missing parties")
    return true
}

/** Verify each signature; returns the set of parties that validly signed. */
function checkSignatures(
    doc: AgreementDocument,
    unsigned: UnsignedAgreementDocument,
    errors: string[],
): Set<string> {
    const signed = new Set<string>()
    if (!doc.signatures?.length) {
        errors.push("no signatures — the agreement is not committed")
        return signed
    }

    // The body is caller-supplied, so a malformed one must surface as an error
    // here rather than throw out of a function documented to collect them.
    let payload: Uint8Array
    try {
        payload = agreementSigningBytes(unsigned)
    } catch (e) {
        errors.push(`agreement payload malformed: ${(e as Error).message}`)
        return signed
    }

    for (const s of doc.signatures) {
        if (s.sigVersion !== "1") {
            errors.push(`signature: unknown sigVersion ${s.sigVersion}`)
            continue
        }
        if (!claimIn(doc.parties, s.signer)) {
            errors.push(`signer "${s.signer}" is not a party`)
            continue
        }
        if (signed.has(claimKey(s.signer))) {
            errors.push(`duplicate signature from "${s.signer}"`)
            continue
        }
        try {
            if (!verifyPrimaryClaimSignature(s.signer, payload, signatureFromHex(s.signature))) {
                errors.push(`signature by "${s.signer}" failed verification`)
                continue
            }
            signed.add(claimKey(s.signer))
        } catch (e) {
            errors.push(
                `signature by "${s.signer}" malformed: ${(e as Error).message}`,
            )
        }
    }
    return signed
}

/** Co-signed means ALL of them: a document one party never signed binds nobody. */
function checkCompleteness(
    doc: AgreementDocument,
    signed: Set<string>,
    errors: string[],
): void {
    for (const p of doc.parties ?? []) {
        if (!signed.has(claimKey(p))) errors.push(`party "${p}" has not signed`)
    }
}

/** §0: the in-channel signers and the committing parties are the same set. */
function checkMembership(
    doc: AgreementDocument,
    members: ReadonlyArray<ClaimReference>,
    errors: string[],
): void {
    for (const p of doc.parties ?? []) {
        if (!claimIn(members, p))
            errors.push(`party "${p}" is not a member of the channel`)
    }
    for (const m of members) {
        if (!claimIn(doc.parties ?? [], m))
            errors.push(`channel member "${m}" is not a party to the agreement`)
    }
}

/** Everything except the §0 membership tie — shared by both public verifiers. */
function verifyCore(
    doc: AgreementDocument,
    errors: string[],
): void {
    if (!checkShape(doc, errors)) return
    let unsigned: UnsignedAgreementDocument
    try {
        unsigned = stripAgreementSignatures(doc)
    } catch {
        errors.push("could not strip signatures")
        return
    }
    const signed = checkSignatures(doc, unsigned, errors)
    checkCompleteness(doc, signed, errors)
}

/**
 * Verify a committed agreement, including the SR-4 brief's §0 invariant.
 *
 * `members` is REQUIRED on purpose: the invariant — the parties who committed
 * are exactly the identities that negotiated in-channel — is the whole reason
 * this primitive exists (definition-of-done #4). Making it optional would let a
 * caller verify signatures, believe the document checked out, and accept an
 * agreement whose parties never negotiated the channel it names. Use
 * {@link verifyAgreementSignatures} when you genuinely do not have the
 * membership and accept that weaker claim knowingly.
 *
 * Collects errors rather than throwing, so an auditor sees every failure at once.
 *
 * @param doc - The document to verify.
 * @param opts.members - The channel's membership (e.g. `session.members`).
 * @returns `{ ok, errors }`.
 */
export function verifyAgreement(
    doc: AgreementDocument,
    opts: { members: ReadonlyArray<ClaimReference> },
): AgreementVerificationResult {
    const errors: string[] = []
    if (!opts?.members?.length) {
        errors.push("verifyAgreement: members required to check the §0 invariant")
        return { ok: false, errors }
    }
    verifyCore(doc, errors)
    if (doc?.agreementVersion === "1") checkMembership(doc, opts.members, errors)
    return { ok: errors.length === 0, errors }
}

/**
 * Verify signatures and completeness ONLY — every party signed the bytes.
 *
 * This deliberately does NOT check the §0 invariant: it cannot tell you the
 * signers are the identities that negotiated the channel the document names.
 * Prefer {@link verifyAgreement}; reach for this only when the membership is
 * genuinely unavailable.
 *
 * @param doc - The document to verify.
 * @returns `{ ok, errors }`.
 */
export function verifyAgreementSignatures(
    doc: AgreementDocument,
): AgreementVerificationResult {
    const errors: string[] = []
    verifyCore(doc, errors)
    return { ok: errors.length === 0, errors }
}
