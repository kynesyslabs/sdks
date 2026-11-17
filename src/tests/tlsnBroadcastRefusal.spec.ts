jest.mock("@/tlsnotary/spawnWorker", () => ({
    spawnTlsnWorker: () => {
        throw new Error("no worker in tests")
    },
}))

import { broadcastRefusal } from "@/tlsnotary/TLSNotaryService"

describe("broadcastRefusal", () => {
    test("reads the node's { error } refusal from extra", () => {
        expect(
            broadcastRefusal({ response: false, extra: { error: "tlsn_store refused: token already used" } }),
        ).toBe("tlsn_store refused: token already used")
    })

    test("reads a bare string extra", () => {
        expect(broadcastRefusal({ response: "Bad Request", extra: "[SERVER] Error while handling broadcastTx: boom" })).toBe(
            "[SERVER] Error while handling broadcastTx: boom",
        )
    })

    test("falls back to response.message", () => {
        expect(broadcastRefusal({ response: { message: "insufficient balance" }, extra: null })).toBe(
            "insufficient balance",
        )
    })

    test("says Unknown error only when nothing explains the refusal", () => {
        expect(broadcastRefusal({ response: false, extra: { error: "  " } })).toBe("Unknown error")
        expect(broadcastRefusal({})).toBe("Unknown error")
    })
})
