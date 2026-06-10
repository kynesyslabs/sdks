import type { ClaimReference, ClaimScheme, ParsedClaimRef } from "./types"

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

export function demosClaimRefForAddress(address: string): ClaimReference {
    const normalized = normalizeDemosAddress(address)
    return `demos:${normalized}` as ClaimReference
}

export function isDemosClaim(ref: ClaimReference): boolean {
    try {
        return parseClaimRef(ref).scheme === "demos"
    } catch {
        return false
    }
}

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

export function demosAddressFromClaim(ref: ClaimReference): string {
    const { scheme, identifier } = parseClaimRef(ref)
    if (scheme !== "demos") {
        throw new Error(
            `demosAddressFromClaim: claim scheme "${scheme}" is not "demos"`,
        )
    }
    return normalizeDemosAddress(identifier)
}
