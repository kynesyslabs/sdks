import { D402Server, memoNamesResource } from "@/d402/server/D402Server"
import type {
    D402PaymentRequirement,
    D402VerificationResult,
} from "@/d402/server/types"

/**
 * The memo is `resourceId:<id>`, optionally followed by ` - <description>`.
 * Matching it with `startsWith` compared a prefix rather than the id, so a
 * payment for `user-12` also satisfied a requirement for `user-1`.
 */
const RECIPIENT = "0x" + "ab".repeat(32)
const PAYER = "0x" + "cd".repeat(32)

function server() {
    return new D402Server({ rpcUrl: "http://localhost:53550" })
}

function requirement(
    over: Partial<D402PaymentRequirement> = {},
): D402PaymentRequirement {
    return {
        amount: "1000000000",
        recipient: RECIPIENT,
        resourceId: "user-1",
        ...over,
    }
}

function verification(
    over: Partial<D402VerificationResult> = {},
): D402VerificationResult {
    return {
        valid: true,
        verified_from: PAYER,
        verified_to: RECIPIENT,
        verified_amount: "1000000000",
        verified_memo: "resourceId:user-1",
        timestamp: Date.now(),
        ...over,
    } as D402VerificationResult
}

describe("memoNamesResource", () => {
    it("accepts the plain memo", () => {
        expect(memoNamesResource("resourceId:user-1", "user-1")).toBe(true)
    })

    it("accepts the memo with a description", () => {
        expect(
            memoNamesResource("resourceId:user-1 - Premium", "user-1"),
        ).toBe(true)
    })

    it("rejects a longer id that merely starts the same", () => {
        expect(memoNamesResource("resourceId:user-12", "user-1")).toBe(false)
    })

    it("rejects a shorter id", () => {
        expect(memoNamesResource("resourceId:user-1", "user-12")).toBe(false)
    })

    it("rejects a memo that only mentions the resource", () => {
        expect(
            memoNamesResource("paid for resourceId:user-1", "user-1"),
        ).toBe(false)
    })
})

describe("D402Server.validatePayment", () => {
    it("accepts a payment for the resource it names", () => {
        expect(
            server().validatePayment(verification(), requirement()),
        ).toBe(true)
    })

    it("refuses a payment made for a neighbouring resource", () => {
        // Same price, same recipient, different resource: before the fix this
        // unlocked user-1 with a payment for user-12.
        expect(
            server().validatePayment(
                verification({ verified_memo: "resourceId:user-12" }),
                requirement(),
            ),
        ).toBe(false)
    })

    it("refuses a payment from another payer when one is pinned", () => {
        // The proof is a public transaction hash; pinning the payer is what
        // stops whoever repeats it from taking the access.
        expect(
            server().validatePayment(
                verification(),
                requirement({ payer: "0x" + "ef".repeat(32) }),
            ),
        ).toBe(false)
    })

    it("accepts the pinned payer's own payment", () => {
        expect(
            server().validatePayment(
                verification(),
                requirement({ payer: PAYER }),
            ),
        ).toBe(true)
    })

    it("matches the pinned payer whatever case either side uses", () => {
        // Both are hex addresses and nothing promises a casing, so a
        // requirement written in upper case used to turn away the very payer
        // it pinned — a paying user denied the thing they paid for.
        expect(
            server().validatePayment(
                verification(),
                requirement({ payer: PAYER.toUpperCase() }),
            ),
        ).toBe(true)
        expect(
            server().validatePayment(
                verification({ verified_from: PAYER.toUpperCase() }),
                requirement({ payer: PAYER }),
            ),
        ).toBe(true)
    })

    it("refuses when the payer is pinned and the node reports none", () => {
        expect(
            server().validatePayment(
                verification({ verified_from: undefined }),
                requirement({ payer: PAYER }),
            ),
        ).toBe(false)
    })

    it("still refuses a short payment", () => {
        expect(
            server().validatePayment(
                verification({ verified_amount: "1" }),
                requirement(),
            ),
        ).toBe(false)
    })
})
