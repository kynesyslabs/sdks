import { D402Server, _normalizeD402AmountToOsBigint } from "@/d402/server/D402Server"
import type {
    D402PaymentRequirement,
    D402VerificationResult,
} from "@/d402/server/types"

// REVIEW: PR-86 review fixes (myc#16) — D402 amount comparison must
// BigInt-normalise the dual-shape (number DEM | string OS) carrier
// before `<`. Lexicographic string compare and Number() coercion both
// produce wrong answers in this domain.

describe("_normalizeD402AmountToOsBigint (myc#16)", () => {
    test("DEM number -> OS bigint", () => {
        expect(_normalizeD402AmountToOsBigint(0)).toBe(0n)
        expect(_normalizeD402AmountToOsBigint(1)).toBe(1_000_000_000n)
        expect(_normalizeD402AmountToOsBigint(100)).toBe(100_000_000_000n)
    })

    test("OS decimal string -> OS bigint", () => {
        expect(_normalizeD402AmountToOsBigint("0")).toBe(0n)
        expect(_normalizeD402AmountToOsBigint("1000000000")).toBe(1_000_000_000n)
        expect(_normalizeD402AmountToOsBigint("100000000000")).toBe(
            100_000_000_000n,
        )
    })

    test("bigint passthrough", () => {
        expect(_normalizeD402AmountToOsBigint(42n)).toBe(42n)
    })

    test("rejects non-canonical / NaN / negative inputs", () => {
        expect(() => _normalizeD402AmountToOsBigint(-1)).toThrow()
        expect(() => _normalizeD402AmountToOsBigint(-1n)).toThrow()
        expect(() => _normalizeD402AmountToOsBigint(NaN)).toThrow()
        expect(() => _normalizeD402AmountToOsBigint("not-a-number")).toThrow()
    })
})

describe("D402Server.validatePayment amount comparison (myc#16)", () => {
    let server: D402Server
    beforeEach(() => {
        server = new D402Server({ rpcUrl: "http://stub" })
    })

    function reqOf(amount: number | string): D402PaymentRequirement {
        return {
            amount,
            recipient: "0xabc",
            resourceId: "res",
        }
    }

    function vOf(amount: number | string | undefined): D402VerificationResult {
        return {
            valid: true,
            verified_to: "0xabc",
            verified_from: "0xsender",
            verified_amount: amount,
            verified_memo: "resourceId:res",
            timestamp: Date.now(),
        }
    }

    test("post-fork OS string vs OS string requirement: large-value compare is correct", () => {
        // 5_000_000_000 OS = 5 DEM. As a string, "5000000000" < "5" is
        // lexicographically true — the bug. With BigInt normalisation
        // it must compare correctly.
        expect(server.validatePayment(vOf("5000000000"), reqOf("5"))).toBe(true)
        expect(server.validatePayment(vOf("5"), reqOf("5000000000"))).toBe(false)
    })

    test("pre-fork DEM number requirement vs post-fork OS string verified_amount", () => {
        // requirement = 5 DEM; verified_amount = "5000000000" OS = 5 DEM. Equal.
        expect(server.validatePayment(vOf("5000000000"), reqOf(5))).toBe(true)
        // requirement = 5 DEM; verified_amount = "4999999999" OS < 5 DEM. Should reject.
        expect(server.validatePayment(vOf("4999999999"), reqOf(5))).toBe(false)
    })

    test("post-fork OS string requirement vs pre-fork DEM number verified_amount", () => {
        // verified_amount = 5 (DEM number, legacy wire); requirement = "5000000000" OS.
        expect(server.validatePayment(vOf(5), reqOf("5000000000"))).toBe(true)
        // verified_amount = 4 DEM number; requirement = "5000000000" OS = 5 DEM. Reject.
        expect(server.validatePayment(vOf(4), reqOf("5000000000"))).toBe(false)
    })

    test("both DEM numbers: comparison still correct", () => {
        expect(server.validatePayment(vOf(10), reqOf(5))).toBe(true)
        expect(server.validatePayment(vOf(5), reqOf(10))).toBe(false)
        expect(server.validatePayment(vOf(5), reqOf(5))).toBe(true)
    })

    test("both OS strings: large magnitudes don't overflow Number", () => {
        // 2^60 OS — bigger than Number.MAX_SAFE_INTEGER (2^53-1). The
        // pre-fix Number() coercion would lose precision here.
        const big = (2n ** 60n).toString()
        const bigPlus = (2n ** 60n + 1n).toString()
        expect(server.validatePayment(vOf(bigPlus), reqOf(big))).toBe(true)
        expect(server.validatePayment(vOf(big), reqOf(bigPlus))).toBe(false)
    })

    test("malformed verified_amount fails closed (returns false)", () => {
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(
                server.validatePayment(
                    vOf("not-a-number" as unknown as string),
                    reqOf(5),
                ),
            ).toBe(false)
        } finally {
            errSpy.mockRestore()
        }
    })
})
