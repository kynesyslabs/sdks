import { EscrowQueries } from "../escrow/EscrowQueries"
import type { Demos } from "../websdk"

const balance = {
    escrowAddress: "example", exists: true, balance: "0", deposits: [],
    expiryTimestamp: 0, expired: false,
}
const queries = [
    {
        method: "get_escrow_balance", params: [{ platform: "github", username: "example" }],
        read: (d: Demos) => EscrowQueries.getEscrowBalance(d, "github", "example"),
        payload: balance,
    },
    {
        method: "get_claimable_escrows", params: [{ address: "example" }],
        read: (d: Demos) => EscrowQueries.getClaimableEscrows(d, "example"), payload: [],
    },
    {
        method: "get_sent_escrows", params: [{ sender: "example" }],
        read: (d: Demos) => EscrowQueries.getSentEscrows(d, "example"), payload: [],
    },
]

describe.each(queries)("$method", ({ method, params, read, payload }) => {
    test("returns the successful payload unchanged", async () => {
        const rpcCall = jest.fn().mockResolvedValue({ result: 200, response: payload })
        await expect(read({ rpcCall } as unknown as Demos)).resolves.toBe(payload)
        expect(rpcCall).toHaveBeenCalledTimes(1)
        expect(rpcCall).toHaveBeenCalledWith({ method, params }, false)
    })

    test("rejects an unsuccessful RPC result", async () => {
        const rpcCall = jest.fn().mockResolvedValue({ result: 503, response: "Unavailable" })
        await expect(read({ rpcCall } as unknown as Demos)).rejects.toThrow(`${method} failed (RPC 503)`)
        expect(rpcCall).toHaveBeenCalledTimes(1)
    })

    test("rejects with the original transport error", async () => {
        const error = new Error("Connection unavailable")
        const rpcCall = jest.fn().mockResolvedValue({ result: 500, response: error })
        await expect(read({ rpcCall } as unknown as Demos)).rejects.toBe(error)
    })
})
