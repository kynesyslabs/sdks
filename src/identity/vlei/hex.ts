/**
 * Local hex helpers for the vLEI attestation module.
 *
 * Kept in-module (rather than importing `@/l2ps/utils/hex`) so `identity/vlei`
 * has no dependency on `l2ps` — l2ps builds on identity, not the reverse. The
 * wire format is byte-identical to the l2ps helpers: bare lowercase hex, with
 * `0x`-prefixed signatures.
 */
export function bytesToHex(bytes: Uint8Array): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0")
    return out
}

/** Wire encoding for an Ed25519 signature — lowercase `0x`-prefixed hex. */
export function signatureToHex(sig: Uint8Array): string {
    return "0x" + bytesToHex(sig)
}

/** Decode hex (with or without `0x`/`0X`) into bytes. Throws on malformed input. */
export function signatureFromHex(hex: string): Uint8Array {
    const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex
    if (h.length === 0 || h.length % 2 !== 0) throw new Error("signatureFromHex: odd-length or empty hex")
    if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error("signatureFromHex: non-hex characters")
    const out = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) out[i / 2] = Number.parseInt(h.slice(i, i + 2), 16)
    return out
}
