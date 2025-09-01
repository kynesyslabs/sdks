export function canonicalJSONStringify(value: unknown): string {
    validatePureJson(value) // Ensure input is pure JSON
    return stableStringify(value)
}

export function validatePureJson(value: unknown, seen = new Set<any>()): void {
    const t = typeof value
    if (
        value === undefined ||
        t === "function" ||
        t === "symbol" ||
        t === "bigint"
    ) {
        throw new Error(
            `Non-JSON value encountered: ${t}. Only RFC 8259 JSON values are supported.`,
        )
    }
    if (value === null) return
    if (t !== "object") return
    if (seen.has(value)) {
        throw new Error("Circular reference detected in JSON payload")
    }
    seen.add(value)
    if (Array.isArray(value)) {
        for (const v of value) validatePureJson(v, seen)
        return
    }
    // Plain object only
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
        throw new Error(
            `Only plain objects are supported. Found prototype: ${proto?.constructor?.name}`,
        )
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
        validatePureJson(v, seen)
    }
}

export function looksLikeJsonString(str: string): boolean {
    const s = str.trim()
    return (
        (s.startsWith("{") && s.endsWith("}")) ||
        (s.startsWith("[") && s.endsWith("]"))
    )
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value)
    }

    if (Array.isArray(value)) {
        const items = value.map(v => stableStringify(v))
        return `[${items.join(",")}]`
    }

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const key of keys) {
        const k = `"${key.replace(/"/g, '\\"')}"`
        const v = stableStringify(obj[key])
        parts.push(`${k}:${v}`)
    }
    return `{${parts.join(",")}}`
}
