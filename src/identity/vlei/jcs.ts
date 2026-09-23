/**
 * JCS (RFC 8785) canonical JSON with NFC string/key normalisation.
 *
 * DACS CORE §B.2 (rule CF-1) requires every JSON string value in a signed or
 * content-hashed artifact to be NFC-normalised before the canonical form is
 * computed, so hashes and signatures reproduce across implementations. The SDK's
 * `canonicalJSONStringify` sorts keys but does NOT NFC-normalise, so it is not
 * usable for byte-exact DACS conformance when a field may carry Unicode (e.g. a
 * GLEIF legal-entity name). This canonicaliser adds NFC. For pure-ASCII data it is
 * byte-identical to `canonicalJSONStringify` (NFC is a no-op on ASCII).
 *
 * Keys are sorted by UTF-16 code units — JS default string sort already does this.
 * Strict: undefined / function / symbol / bigint throw (SIG/hash inputs must be
 * pruned first).
 */
export function jcsCanonicalize(value: unknown): string {
    return serialize(value, new Set())
}

function serialize(value: unknown, seen: Set<object>): string {
    if (value === null) return "null"
    const t = typeof value
    if (t === "string") return JSON.stringify((value as string).normalize("NFC"))
    if (t === "boolean") return value ? "true" : "false"
    if (t === "number") {
        if (!Number.isFinite(value)) throw new Error("JCS: non-finite number")
        return JSON.stringify(value)
    }
    if (t === "bigint" || t === "undefined" || t === "function" || t === "symbol")
        throw new Error(`JCS: non-JSON value: ${t}`)

    const obj = value as object
    if (seen.has(obj)) throw new Error("JCS: circular reference")
    seen.add(obj)

    let out: string
    if (Array.isArray(obj)) {
        out = `[${obj.map(v => serialize(v, seen)).join(",")}]`
    } else {
        const proto = Object.getPrototypeOf(obj)
        if (proto !== Object.prototype && proto !== null)
            throw new Error(`JCS: only plain objects supported (found ${proto?.constructor?.name})`)
        const rec = obj as Record<string, unknown>
        // NFC-normalise keys for output + sort, but look up values by the ORIGINAL
        // key (normalisation can change the string).
        const entries = Object.keys(rec).map(k => [k.normalize("NFC"), k] as const)
        // Two distinct source keys can NFC-normalise to the SAME string (e.g. "é"
        // and "é"). Emitting both yields ambiguous, duplicate-keyed JSON whose
        // meaning depends on the reader's dedup policy — reject rather than sign it.
        if (new Set(entries.map(e => e[0])).size !== entries.length) {
            throw new Error("JCS: NFC-normalised key collision")
        }
        entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        const parts = entries.map(([nk, ok]) => `${JSON.stringify(nk)}:${serialize(rec[ok], seen)}`)
        out = `{${parts.join(",")}}`
    }
    seen.delete(obj)
    return out
}
