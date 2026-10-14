import { d402Required } from "@/d402/server/middleware"
import { D402Server } from "@/d402/server/D402Server"
import type { D402PaymentRequirement } from "@/d402/server/types"

/**
 * The payer pin has to survive the trip through the middleware.
 *
 * `validatePayment` grew a payer check, but the Express middleware — the
 * integration most applications actually use — built its requirements without
 * one, so the check was never reached on that path and a proof stayed a
 * bearer token there.
 */

const RECIPIENT = "0x" + "ab".repeat(32)
const PAYER = "0x" + "cd".repeat(32)

function fakeRes() {
    const res: any = { statusCode: 0, body: null }
    res.status = (code: number) => {
        res.statusCode = code
        return res
    }
    res.json = (body: unknown) => {
        res.body = body
        return res
    }
    return res
}

function stubVerified(from: string) {
    jest.spyOn(D402Server.prototype, "verify").mockResolvedValue({
        valid: true,
        verified_from: from,
        verified_to: RECIPIENT,
        verified_amount: "1000000000",
        verified_memo: "resourceId:article-1",
        timestamp: Date.now(),
    } as never)
}

afterEach(() => {
    jest.restoreAllMocks()
})

describe("d402Required payer pinning", () => {
    it("carries a pinned payer into the requirement it validates against", async () => {
        stubVerified(PAYER)
        const seen: D402PaymentRequirement[] = []
        jest.spyOn(D402Server.prototype, "validatePayment").mockImplementation(
            (_verification, requirement) => {
                seen.push(requirement)
                return true
            },
        )

        const middleware = d402Required({
            amount: "1000000000",
            resourceId: "article-1",
            rpcUrl: "http://localhost:53550",
            recipient: RECIPIENT,
            payer: PAYER,
        })

        let nexted = false
        await middleware(
            { headers: { "x-payment-proof": "0x" + "11".repeat(32) } },
            fakeRes(),
            () => {
                nexted = true
            },
        )

        expect(seen[0]?.payer).toBe(PAYER)
        expect(nexted).toBe(true)
    })

    it("takes a per-request payer, the way it takes a per-request recipient", async () => {
        stubVerified(PAYER)
        const seen: D402PaymentRequirement[] = []
        jest.spyOn(D402Server.prototype, "validatePayment").mockImplementation(
            (_verification, requirement) => {
                seen.push(requirement)
                return true
            },
        )

        const middleware = d402Required({
            amount: "1000000000",
            resourceId: "article-1",
            rpcUrl: "http://localhost:53550",
            recipient: RECIPIENT,
        })

        await middleware(
            {
                headers: { "x-payment-proof": "0x" + "11".repeat(32) },
                d402Payer: PAYER,
            },
            fakeRes(),
            () => {},
        )

        expect(seen[0]?.payer).toBe(PAYER)
    })

    it("advertises the pinned payer in the 402 it returns", async () => {
        const middleware = d402Required({
            amount: "1000000000",
            resourceId: "article-1",
            rpcUrl: "http://localhost:53550",
            recipient: RECIPIENT,
            payer: PAYER,
        })

        const res = fakeRes()
        await middleware({ headers: {} }, res, () => {})

        expect(res.statusCode).toBe(402)
        expect(res.body.payer).toBe(PAYER)
    })

    it("turns away a proof from someone else once a payer is pinned", async () => {
        // End to end through the real validation, which is the path that was
        // unreachable from this integration before.
        stubVerified("0x" + "ef".repeat(32))

        const middleware = d402Required({
            amount: "1000000000",
            resourceId: "article-1",
            rpcUrl: "http://localhost:53550",
            recipient: RECIPIENT,
            payer: PAYER,
        })

        const res = fakeRes()
        let nexted = false
        await middleware(
            { headers: { "x-payment-proof": "0x" + "11".repeat(32) } },
            res,
            () => {
                nexted = true
            },
        )

        expect(nexted).toBe(false)
        expect(res.statusCode).toBe(403)
    })
})
