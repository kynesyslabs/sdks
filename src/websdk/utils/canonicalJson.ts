export function canonicalJSONStringify(value: unknown): string {
    strictValidate(value, new Set())
    return stableStringify(value)
}

// Strict validation: reject undefined/function/symbol/BigInt anywhere
function strictValidate(value: unknown, seen: Set<any>): void {
    const t = typeof value
    if (
        t === "undefined" ||
        t === "function" ||
        t === "symbol" ||
        t === "bigint"
    ) {
        throw new Error(`Non-JSON value encountered: ${t}`)
    }
    if (value === null) return
    if (t !== "object") return

    if (seen.has(value))
        throw new Error("Circular reference detected in JSON payload")
    seen.add(value)

    if (Array.isArray(value)) {
        for (const v of value) strictValidate(v, seen)
        return
    }

    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
        throw new Error(
            `Only plain objects are supported. Found prototype: ${proto?.constructor?.name}`,
        )
    }

    for (const v of Object.values(value as Record<string, unknown>)) {
        strictValidate(v, seen)
    }
}

export function validatePureJson(value: unknown, seen = new Set<any>()): void {
    // Backward-compatible validator: same strict rules as above
    strictValidate(value, seen)
}

export function looksLikeJsonString(str: string): boolean {
    const s = str.trim()
    return (
        (s.startsWith("{") && s.endsWith("}")) ||
        (s.startsWith("[") && s.endsWith("]"))
    )
}

function stableStringify(value: unknown): string {
    const t = typeof value
    if (value === null || t === "number" || t === "boolean" || t === "string") {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        const items = (value as unknown[]).map(v => stableStringify(v))
        return `[${items.join(",")}]`
    }
    // object (validated as plain)
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const key of keys) {
        const k = JSON.stringify(key)
        const v = stableStringify(obj[key])
        parts.push(`${k}:${v}`)
    }
    return `{${parts.join(",")}}`
}
