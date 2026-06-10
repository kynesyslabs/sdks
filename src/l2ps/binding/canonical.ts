import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
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

export function signatureFromHex(hex: string): Uint8Array {
    const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex
    if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) {
        throw new Error(`signatureFromHex: not a valid hex string`)
    }
    const out = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) {
        out[i / 2] = parseInt(h.slice(i, i + 2), 16)
    }
    return out
}

export function signatureToHex(sig: Uint8Array): string {
    return "0x" + bytesToHex(sig)
}

function bytesToHex(bytes: Uint8Array): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0")
    }
    return out
}
