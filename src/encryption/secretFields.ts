/**
 * Keeps key material out of serialisation and logs.
 *
 * Wallet-like objects hold seeds and private keys in instance fields. A plain
 * field is enumerable, so JSON.stringify, object spread, Object.keys,
 * structuredClone and error reporters that walk own keys copy it out, and
 * Node's console.log prints it.
 *
 * Classes that hold secrets use both helpers below:
 * - `hideSecretFields` turns the named fields into non-enumerable data
 *   properties. Reads and writes by name behave as before; generic walkers
 *   no longer see them.
 * - `toJSON()` and `[INSPECT_CUSTOM]()` return an allow-listed summary, so the
 *   object prints and serialises without the secret even when a walker does
 *   look at non-enumerable properties.
 *
 * Browser devtools still show non-enumerable properties when an object is
 * expanded by hand; only reaching the value by name is meant to work.
 */

/** Node's util.inspect hook; console.log in Node calls it. */
export const INSPECT_CUSTOM: unique symbol = Symbol.for(
    "nodejs.util.inspect.custom",
)

export function hideSecretFields(
    target: object,
    names: readonly string[],
): void {
    for (const name of names) {
        Object.defineProperty(target, name, {
            value: (target as Record<string, unknown>)[name],
            writable: true,
            enumerable: false,
            configurable: true,
        })
    }
}

/**
 * Renders a redacted summary for util.inspect, e.g.
 * `UnifiedCrypto {"instanceId":"default","hasMasterSeed":true}`.
 */
export function redactedInspect(
    label: string,
    summary: Record<string, unknown>,
): string {
    return `${label} ${JSON.stringify(summary)}`
}
