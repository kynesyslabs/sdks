import {
    isDemosClaim,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type {
    AgreementDocument,
    AgreementSignature,
    UnsignedAgreementDocument,
} from "./types"
import {
    agreementHashHex,
    agreementSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripAgreementSignatures,
} from "./canonical"

/** Build the unsigned document shell. */
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
 * claim — the same key that signed in-channel (the SR-4 brief's §0 invariant),
 * never the RSA subnet key.
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
    if (!unsigned.parties.includes(signer))
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
 * A document missing any party's signature is not committed — `verifyAgreement`
 * rejects it.
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
    const signatures: AgreementSignature[] = []
    for (const s of opts.signers) {
        signatures.push(await signAgreement(unsigned, s.claim, s.demos))
    }
    return { ...unsigned, signatures }
}

/** The anchorable identity of a document — recomputed from its bytes. */
export function agreementHash(doc: AgreementDocument): string {
    return agreementHashHex(stripAgreementSignatures(doc))
}

export interface AgreementVerificationResult {
    ok: boolean
    errors: string[]
}

/**
 * Verify everything a third party can check given only the public keys:
 * (a) every signature is valid under its signer's CCI primary key,
 * (b) every signer is a party, (c) EVERY party signed — a partially-signed
 * document is not an agreement, (d) no duplicate signers.
 *
 * Pass `members` (the channel's membership) to also enforce the SR-4 brief's
 * §0 invariant: the parties who committed this are exactly the identities that
 * negotiated in-channel.
 *
 * Collects errors rather than throwing, so an auditor sees every failure at once.
 */
export function verifyAgreement(
    doc: AgreementDocument,
    opts?: { members?: ReadonlyArray<ClaimReference> },
): AgreementVerificationResult {
    const errors: string[] = []
    if (doc?.agreementVersion !== "1") {
        errors.push("agreementVersion is not 1")
        return { ok: false, errors }
    }
    if (!doc.channelId) errors.push("missing channelId")
    if (!doc.parties?.length) errors.push("missing parties")

    let unsigned: UnsignedAgreementDocument
    try {
        unsigned = stripAgreementSignatures(doc)
    } catch {
        errors.push("could not strip signatures")
        return { ok: false, errors }
    }

    const signed = new Set<ClaimReference>()
    if (!doc.signatures?.length) {
        errors.push("no signatures — the agreement is not committed")
    } else {
        const payload = agreementSigningBytes(unsigned)
        for (const s of doc.signatures) {
            if (s.sigVersion !== "1") {
                errors.push(`signature: unknown sigVersion ${s.sigVersion}`)
                continue
            }
            if (!doc.parties.includes(s.signer)) {
                errors.push(`signer "${s.signer}" is not a party`)
                continue
            }
            if (signed.has(s.signer)) {
                errors.push(`duplicate signature from "${s.signer}"`)
                continue
            }
            try {
                const ok = verifyPrimaryClaimSignature(
                    s.signer,
                    payload,
                    signatureFromHex(s.signature),
                )
                if (!ok) {
                    errors.push(`signature by "${s.signer}" failed verification`)
                    continue
                }
                signed.add(s.signer)
            } catch (e) {
                errors.push(
                    `signature by "${s.signer}" malformed: ${(e as Error).message}`,
                )
            }
        }
    }

    // Co-signed means ALL of them. A document one party never signed binds nobody.
    for (const p of doc.parties ?? []) {
        if (!signed.has(p)) errors.push(`party "${p}" has not signed`)
    }

    // §0: the in-channel signers and the committing parties must be the same set.
    if (opts?.members) {
        for (const p of doc.parties ?? []) {
            if (!opts.members.includes(p))
                errors.push(`party "${p}" is not a member of the channel`)
        }
        for (const m of opts.members) {
            if (!doc.parties?.includes(m))
                errors.push(`channel member "${m}" is not a party to the agreement`)
        }
    }

    return { ok: errors.length === 0, errors }
}
