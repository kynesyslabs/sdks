import { describe, test, expect } from "@jest/globals"

import { SubDemPrecisionError } from "./networkInfo"
import { OS_PER_DEM } from "./constants"

// REVIEW: P4 commit 3 — public-API guard tests. The actual
// `Demos.getNetworkInfo` / `_isPostForkCached` round-trip is exercised
// in src/tests/forkDetection.test.ts because it needs the full Demos
// class wired with a stubbed nodeCall.

describe("SubDemPrecisionError", () => {
    test("carries the offending OS amount and the truncated remainder", () => {
        const amountOs = 1_234_567_890n
        const remainder = amountOs % OS_PER_DEM // 234_567_890n
        const err = new SubDemPrecisionError(amountOs, remainder)
        expect(err).toBeInstanceOf(Error)
        expect(err).toBeInstanceOf(SubDemPrecisionError)
        expect(err.name).toBe("SubDemPrecisionError")
        expect(err.amountOs).toBe(amountOs)
        expect(err.subDemRemainderOs).toBe(remainder)
        expect(err.message).toContain("1234567890 OS")
        expect(err.message).toContain("234567890 OS")
        expect(err.message).toContain("pre-fork node")
    })

    test("instanceof works after JSON-like construction", () => {
        const err = new SubDemPrecisionError(1n, 1n)
        expect(err instanceof SubDemPrecisionError).toBe(true)
        expect(err instanceof Error).toBe(true)
    })
})
