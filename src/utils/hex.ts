/**
 * Hex encoding for bytes and signatures, shared by every module that puts
 * either on the wire (identity, l2ps), so the format cannot drift between
 * them: bare lowercase hex for digests, `0x`-prefixed lowercase hex for
 * signatures.
 *
 * It lives here, outside both, because l2ps builds on identity: a copy in
 * one or an import across them would be the only way to share it otherwise.
 */

/** Encode bytes as lowercase, unprefixed hex. */
export function bytesToHex(bytes: Uint8Array): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0")
    }
    return out
}

/** Wire encoding for an Ed25519 signature: lowercase `0x`-prefixed hex. */
export function signatureToHex(sig: Uint8Array): string {
    return "0x" + bytesToHex(sig)
}

/**
 * Decode hex, with or without a `0x` / `0X` prefix, into bytes.
 *
 * Empty, odd-length and non-hex input throw, so a malformed signature
 * surfaces here instead of as a truncated or empty byte array that fails
 * verification somewhere less obvious.
 *
 * @throws {Error} On empty, odd-length or non-hex input.
 */
export function signatureFromHex(hex: string): Uint8Array {
    const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex
    if (h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) {
        throw new Error("signatureFromHex: not a valid hex string")
    }
    const out = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) {
        out[i / 2] = Number.parseInt(h.slice(i, i + 2), 16)
    }
    return out
}
