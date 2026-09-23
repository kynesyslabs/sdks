import { sha256 } from "@noble/hashes/sha2"
import { jcsCanonicalize } from "./jcs"
import { bytesToHex, signatureFromHex, signatureToHex } from "./hex"
import type { UnsignedVleiAttestation, VleiAttestation } from "./types"

/**
 * Domain prefix for attestation signatures. Aligns with the established
 * `dacs-*:v1:` family so a signature cannot be lifted into a binding,
 * channelmsg, or transcript context (or vice versa).
 */
export const ATTESTATION_DOMAIN_PREFIX = "dacs-vlei-attestation:v1:"

/** hex(sha256(JCS+NFC(value))) — the DACS CORE §B.2 canonical digest (record/chain/tx/commitment). */
export function canonicalDigest(value: unknown): string {
    return bytesToHex(sha256(new TextEncoder().encode(jcsCanonicalize(value))))
}

/**
 * The commitment the attester signs: hex(sha256(JCS(attestation_without_signature))).
 * Stable content-id for the attestation; also the value external systems reference.
 */
export function attestationCommitment(att: UnsignedVleiAttestation): string {
    return canonicalDigest(att)
}

/**
 * Bytes the attestation signature covers:
 *   `dacs-vlei-attestation:v1:` || attestationCommitment
 */
export function attestationSigningBytes(unsigned: UnsignedVleiAttestation): Uint8Array {
    return new TextEncoder().encode(ATTESTATION_DOMAIN_PREFIX + attestationCommitment(unsigned))
}

export function stripAttestationSignature(a: VleiAttestation): UnsignedVleiAttestation {
    const { signature: _signature, ...rest } = a
    return rest
}

export { signatureFromHex, signatureToHex }
