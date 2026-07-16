import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { bytesToHex, signatureFromHex, signatureToHex } from "@/l2ps/utils/hex"
import type { AgreementDocument, UnsignedAgreementDocument } from "@/l2ps/agreement/types"

/**
 * Domain separation prefix (CORE §B.7). A signature lifted from another domain
 * — channelmsg, transcript, binding — fails here, and vice versa.
 */
export const AGREEMENT_DOMAIN_PREFIX = "dacs-agreement:v1:"

/**
 * Reject values whose canonical form would not be injective.
 *
 * `JSON.stringify` renders `NaN`, `Infinity` and `-Infinity` as `null`, so
 * `{ price: NaN }` and `{ price: null }` would hash identically — serialisation
 * could change the agreed terms while every signature still verified. The body
 * is caller-supplied (`body: unknown`), so this is reachable from the wire and
 * has to be refused rather than silently flattened.
 *
 * Cycles are skipped here and left to {@link canonicalJSONStringify}, which
 * rejects them (walking them ourselves would not terminate).
 *
 * @param value - The value to walk.
 * @param path - Human-readable path used in the error message.
 * @param seen - Cycle guard; callers should not pass this.
 * @throws If any nested number is not finite.
 */
function assertInjectivelySerialisable(
    value: unknown,
    path = "body",
    seen: WeakSet<object> = new WeakSet(),
): void {
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new Error(
                `agreement: ${path} is ${String(value)}, which canonicalises to null and would collide with a real null`,
            )
        return
    }
    if (!value || typeof value !== "object") return
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
        value.forEach((v, i) => assertInjectivelySerialisable(v, `${path}[${i}]`, seen))
        return
    }
    for (const [k, v] of Object.entries(value)) {
        assertInjectivelySerialisable(v, `${path}.${k}`, seen)
    }
}

/**
 * Hex digest of `JCS(document_without_signatures)`.
 *
 * This IS the agreement's identity and the value anchored on-chain: recompute
 * it from the bytes, never trust a hash that travels alongside the document.
 * Exposed as a primitive so an auditor can re-derive it independently.
 *
 * @param unsigned - The document without its signatures.
 * @returns Lowercase hex sha256 of the canonical bytes.
 * @throws If the document cannot be canonicalised injectively (a non-finite
 * number, or anything `canonicalJSONStringify` rejects — `undefined`, bigint,
 * a class instance, a cycle). Callers that must not throw — such as
 * `verifyAgreement` — catch this.
 */
export function agreementHashHex(unsigned: UnsignedAgreementDocument): string {
    assertInjectivelySerialisable(unsigned, "agreement")
    const canonical = canonicalJSONStringify(unsigned)
    return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}

/**
 * Bytes each party's co-signature covers:
 *   `dacs-agreement:v1:` || agreement_hash_hex
 *
 * @param unsigned - The document without its signatures.
 * @returns The domain-separated payload to sign or verify.
 * @throws Whatever {@link agreementHashHex} throws.
 */
export function agreementSigningBytes(
    unsigned: UnsignedAgreementDocument,
): Uint8Array {
    return new TextEncoder().encode(
        AGREEMENT_DOMAIN_PREFIX + agreementHashHex(unsigned),
    )
}

/**
 * Drop the signatures to recover the bytes they were taken over.
 *
 * Signatures are excluded from both signing and anchoring by construction: a
 * document cannot commit to its own signatures, and the anchor must be stable
 * no matter how many parties have signed so far.
 *
 * @param doc - A (possibly partially) signed document.
 * @returns The same document without its `signatures` field.
 */
export function stripAgreementSignatures(
    doc: AgreementDocument,
): UnsignedAgreementDocument {
    const { signatures: _signatures, ...rest } = doc
    return rest
}

export { signatureFromHex, signatureToHex }
