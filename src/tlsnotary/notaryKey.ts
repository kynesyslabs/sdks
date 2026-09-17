/**
 * Comparing a presentation's signer against the notary you trust.
 *
 * `TLSNotary.verify()` reported both the notary key it knows about and the
 * verifying key carried by the presentation, and never compared them. A
 * presentation notarised by anyone — including a notary the presenter runs —
 * verified exactly like one from the configured notary, so the result proved
 * that *some* notary signed a transcript, not that yours did.
 *
 * The two values do not arrive in the same shape: the presentation gives raw
 * key bytes as hex, while a configured key may be hex or a PEM/DER encoding
 * that wraps those bytes in an ASN.1 header. Both are reduced to hex here,
 * and a DER encoding matches when it ends with the raw key.
 */

/** Reduce a configured notary key to lowercase hex, or null if unreadable. */
export function normaliseNotaryKey(value: string): string | null {
    const text = value.trim()
    if (!text) return null

    const hex = text.replace(/^0x/i, "")
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
        return hex.toLowerCase()
    }

    // Only a real PEM block is decoded: any other text survives the strip and
    // would "decode" into arbitrary bytes that then compare against nothing.
    if (!/-----BEGIN[^-]*-----/.test(text)) {
        return null
    }
    const pem = text.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\s+/g, "")
    if (!/^[A-Za-z0-9+/]+=*$/.test(pem) || pem.length === 0) {
        return null
    }
    try {
        return Buffer.from(pem, "base64").toString("hex").toLowerCase()
    } catch {
        return null
    }
}

/**
 * Does this presentation carry the notary's signature?
 *
 * @param presentationKey - Verifying key from the presentation, as hex.
 * @param configuredKey - The notary key the caller pinned.
 */
export function notaryKeyMatches(
    presentationKey: string,
    configuredKey: string,
): boolean {
    const presented = normaliseNotaryKey(presentationKey)
    const expected = normaliseNotaryKey(configuredKey)
    if (!presented || !expected) return false

    // Equal outright, or the pinned key is a DER encoding ending in the same
    // raw bytes the presentation reports.
    return (
        presented === expected ||
        (expected.length > presented.length && expected.endsWith(presented))
    )
}

/** Thrown when a presentation was notarised by someone else. */
export class NotaryKeyMismatchError extends Error {
    readonly presentationKey: string
    readonly expectedKey: string

    constructor(presentationKey: string, expectedKey: string) {
        super(
            "TLSNotary presentation was signed by a different notary: " +
                `presentation ${presentationKey.slice(0, 16)}…, expected ` +
                `${expectedKey.slice(0, 16)}…`,
        )
        this.name = "NotaryKeyMismatchError"
        this.presentationKey = presentationKey
        this.expectedKey = expectedKey
    }
}
