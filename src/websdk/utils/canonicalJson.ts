export function canonicalJSONStringify(value: unknown): string {
    return stableStringify(value)
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
        const k = JSON.stringify(key)
        const v = stableStringify(obj[key])
        parts.push(`${k}:${v}`)
    }
    return `{${parts.join(",")}}`
}
