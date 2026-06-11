/**
 * Hex encoding helpers shared across the SR-4 modules
 * (binding / channel / anchor) so the signature wire format stays
 * identical in every place that produces or consumes a hex string.
 */

export function bytesToHex(bytes: Uint8Array): string {
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0")
    }
    return out
}

export function signatureToHex(sig: Uint8Array): string {
    return "0x" + bytesToHex(sig)
}

export function signatureFromHex(hex: string): Uint8Array {
    const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex
    if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) {
        throw new Error("signatureFromHex: not a valid hex string")
    }
    const out = new Uint8Array(h.length / 2)
    for (let i = 0; i < h.length; i += 2) {
        out[i / 2] = parseInt(h.slice(i, i + 2), 16)
    }
    return out
}
