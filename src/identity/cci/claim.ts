import type { ClaimReference, ClaimScheme, ParsedClaimRef } from "./types"

/**
 * Split a `ClaimReference` into its scheme and identifier components.
 *
 * @param ref - `"<scheme>:<identifier>"` string.
 * @returns The parsed scheme/identifier pair.
 * @throws {TypeError} If `ref` is not a string.
 * @throws {Error}     If `ref` is missing the colon, has an empty scheme,
 *                     or has an empty identifier.
 */
export function parseClaimRef(ref: ClaimReference): ParsedClaimRef {
    if (typeof ref !== "string") {
        throw new TypeError(`parseClaimRef: expected string, got ${typeof ref}`)
    }
    const colon = ref.indexOf(":")
    if (colon < 1 || colon === ref.length - 1) {
        throw new Error(
            `parseClaimRef: malformed ClaimReference "${ref}" (expected "<scheme>:<identifier>")`,
        )
    }
    return {
        scheme: ref.slice(0, colon) as ClaimScheme,
        identifier: ref.slice(colon + 1),
    }
}

/**
 * Build the canonical `demos:<address>` ClaimReference for a Demos
 * Ed25519 address. The address is lowercased and 0x-prefixed.
 *
 * @param address - Hex Ed25519 address, with or without `0x` prefix.
 * @returns       A `demos:0x...` ClaimReference.
 * @throws {Error} If `address` is not 64-hex (32-byte).
 */
export function demosClaimRefForAddress(address: string): ClaimReference {
    const normalized = normalizeDemosAddress(address)
    return `demos:${normalized}` as ClaimReference
}

/**
 * Test whether a ClaimReference parses and has the `demos` scheme.
 * Safe for arbitrary input — never throws.
 */
export function isDemosClaim(ref: ClaimReference): boolean {
    try {
        return parseClaimRef(ref).scheme === "demos"
    } catch {
        return false
    }
}

/**
 * Normalise a Demos Ed25519 address into the canonical lowercase
 * `0x`-prefixed form. The Demos node accepts both forms; we settle on one
 * so comparisons (`claimAddress !== connected`) are deterministic.
 *
 * @param address - Hex address, with or without `0x` prefix.
 * @returns       Lowercase `0x`-prefixed 64-hex string.
 * @throws {Error} If the input is not hex or is the wrong length for an
 *                 Ed25519 public key (32 bytes = 64 hex chars).
 */
export function normalizeDemosAddress(address: string): string {
    const a = address.startsWith("0x") || address.startsWith("0X")
        ? address.slice(2)
        : address
    if (!/^[0-9a-fA-F]+$/.test(a)) {
        throw new Error(
            `normalizeDemosAddress: not a hex string: "${address}"`,
        )
    }
    if (a.length !== 64) {
        throw new Error(
            `normalizeDemosAddress: expected 32-byte (64-hex) Ed25519 address, got ${a.length} hex chars`,
        )
    }
    return "0x" + a.toLowerCase()
}

/**
 * Extract the normalised Demos Ed25519 address embedded in a `demos:`
 * ClaimReference. Refuses non-demos schemes — see `parseClaimRef` for the
 * scheme-agnostic parse.
 *
 * @param ref - A `demos:0x...` ClaimReference.
 * @returns   Lowercase `0x`-prefixed Ed25519 address.
 * @throws {Error} If the scheme is not `demos` or the identifier is not
 *                 a valid Ed25519 address.
 */
export function demosAddressFromClaim(ref: ClaimReference): string {
    const { scheme, identifier } = parseClaimRef(ref)
    if (scheme !== "demos") {
        throw new Error(
            `demosAddressFromClaim: claim scheme "${scheme}" is not "demos"`,
        )
    }
    return normalizeDemosAddress(identifier)
}
