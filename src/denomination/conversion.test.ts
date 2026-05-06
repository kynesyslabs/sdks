import { describe, test, expect } from "bun:test"

import {
    demToOs,
    osToDem,
    parseOsString,
    toOsString,
    formatDem,
} from "./conversion"

// REVIEW: P0 foundation — verbatim test suite from IDEA.md §0.5 plus three
// edge-case tests called out in the P0 task brief.

describe("demToOs", () => {
    test("converts whole DEM to OS", () => {
        expect(demToOs(1)).toBe(1_000_000_000n)
        expect(demToOs(100)).toBe(100_000_000_000n)
        expect(demToOs(0)).toBe(0n)
    })

    test("converts fractional DEM to OS", () => {
        expect(demToOs("0.5")).toBe(500_000_000n)
        expect(demToOs("0.000000001")).toBe(1n)
        expect(demToOs("1.123456789")).toBe(1_123_456_789n)
    })

    test("rejects too many decimals", () => {
        expect(() => demToOs("0.0000000001")).toThrow(
            "exceeds maximum 9 decimal places",
        )
    })

    test("accepts string input", () => {
        expect(demToOs("100")).toBe(100_000_000_000n)
    })

    // Edge case: explicit zero string input.
    test("converts the string \"0\" to 0n", () => {
        expect(demToOs("0")).toBe(0n)
    })

    // Edge case: negative inputs are rejected with a clear message. The
    // BigInt of "-1000000000" is < 0n, which trips the negativity guard.
    test("rejects negative DEM input", () => {
        expect(() => demToOs(-1)).toThrow("Negative amounts not allowed")
    })
})

describe("osToDem", () => {
    test("converts OS to DEM string", () => {
        expect(osToDem(1_000_000_000n)).toBe("1.0")
        expect(osToDem(500_000_000n)).toBe("0.5")
        expect(osToDem(1n)).toBe("0.000000001")
        expect(osToDem(0n)).toBe("0.0")
    })

    test("handles large amounts", () => {
        expect(osToDem(1_000_000_000_000_000_000n)).toBe("1000000000.0")
    })

    // Edge case: negative OS amounts produce a leading "-" and otherwise
    // follow the same trimming rules as positive amounts.
    test("handles negative OS amounts", () => {
        expect(osToDem(-500_000_000n)).toBe("-0.5")
    })
})

describe("wire format", () => {
    test("round-trips through string serialization", () => {
        const original = 123_456_789_012n
        const wire = toOsString(original)
        expect(parseOsString(wire)).toBe(original)
    })
})

describe("formatDem", () => {
    test("formats with unit", () => {
        expect(formatDem(1_000_000_000n)).toBe("1.0 DEM")
    })
})
