import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { bytesToHex, signatureFromHex, signatureToHex } from "../utils/hex"
import type {
    L2PSMembershipBinding,
    UnsignedL2PSMembershipBinding,
} from "./types"

/**
 * Domain prefix for binding signatures. The brief specifies prefixes for
 * channelmsg and transcript but not for the binding itself; per §5 of the
 * brief, all signatures in this family must be domain-separated, so we
 * align with the established `dacs-*:v1:` pattern.
 */
export const BINDING_DOMAIN_PREFIX = "dacs-binding:v1:"

/**
 * Bytes that the binding signature covers:
 *   `dacs-binding:v1:` || sha256(JCS(binding_without_signature))
 *
 * Domain separation prevents this signature from being lifted into a
 * channelmsg or transcript context (or vice versa).
 */
export function bindingSigningBytes(
    unsigned: UnsignedL2PSMembershipBinding,
): Uint8Array {
    const canonical = canonicalJSONStringify(unsigned)
    const digestHex = bytesToHex(sha256(new TextEncoder().encode(canonical)))
    return new TextEncoder().encode(BINDING_DOMAIN_PREFIX + digestHex)
}

export function stripBindingSignature(
    b: L2PSMembershipBinding,
): UnsignedL2PSMembershipBinding {
    const { signature: _signature, ...rest } = b
    return rest
}

// Re-exported from the shared utility so existing imports of
// `signatureFromHex` / `signatureToHex` from this module keep working.
export { signatureFromHex, signatureToHex }
