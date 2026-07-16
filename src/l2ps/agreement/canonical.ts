import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { bytesToHex, signatureFromHex, signatureToHex } from "../utils/hex"
import type { AgreementDocument, UnsignedAgreementDocument } from "./types"

/**
 * Domain separation prefix (CORE §B.7). A signature lifted from another domain
 * — channelmsg, transcript, binding — fails here, and vice versa.
 */
export const AGREEMENT_DOMAIN_PREFIX = "dacs-agreement:v1:"

/**
 * Hex digest of `JCS(document_without_signatures)`.
 *
 * This IS the agreement's identity and the value anchored on-chain: recompute
 * it from the bytes, never trust a hash that travels alongside the document.
 * Exposed as a primitive so an auditor can re-derive it independently.
 */
export function agreementHashHex(unsigned: UnsignedAgreementDocument): string {
    const canonical = canonicalJSONStringify(unsigned)
    return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}

/**
 * Bytes each party's co-signature covers:
 *   `dacs-agreement:v1:` || agreement_hash_hex
 */
export function agreementSigningBytes(
    unsigned: UnsignedAgreementDocument,
): Uint8Array {
    return new TextEncoder().encode(
        AGREEMENT_DOMAIN_PREFIX + agreementHashHex(unsigned),
    )
}

export function stripAgreementSignatures(
    doc: AgreementDocument,
): UnsignedAgreementDocument {
    const { signatures: _signatures, ...rest } = doc
    return rest
}

export { signatureFromHex, signatureToHex }
