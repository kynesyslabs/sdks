/**
 * Hex encoding helpers shared across the SR-4 modules
 * (binding / channel / anchor) so the signature wire format stays
 * identical in every place that produces or consumes a hex string.
 */

/**
 * Encode raw bytes as a lowercase, unprefixed hex string. Used for hash
 * digests carried in signing payloads (the wire signature wrappers use
 * the `0x`-prefixed `signatureToHex` instead).
 */
export function bytesToHex(bytes: Uint8Array): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0")
    }
    return out
}

/**
 * Wire encoding for an Ed25519 signature — lowercase `0x`-prefixed hex.
 * Match for `signatureFromHex` on the verify side.
 */
export function signatureToHex(sig: Uint8Array): string {
    return "0x" + bytesToHex(sig)
}

/**
 * Decode a hex string (with or without a `0x` / `0X` prefix) into a
 * `Uint8Array`. Rejects odd-length input and non-hex characters so a
 * malformed wire signature surfaces immediately instead of producing a
 * silently truncated byte array.
 *
 * @throws {Error} If the cleaned hex string is odd-length or contains
 *                 non-hex characters.
 */
export function signatureFromHex(hex: string): Uint8Array {
    const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex
    if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) {
        throw new Error("signatureFromHex: not a valid hex string")
    }
    const out = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) {
        out[i / 2] = Number.parseInt(h.slice(i, i + 2), 16)
    }
    return out
}
