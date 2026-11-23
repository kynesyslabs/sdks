import type { RPCResponse } from "@/types/communication/rpc"

/**
 * A node call the node answered with a result other than 200, such as
 * `404 no_result_commitment` from `getTransactionProof`. Thrown by the typed
 * finality and storage proof reads on `Demos`; `nodeCall` and `call` keep
 * returning the bare response body.
 */
export class NodeCallError extends Error {
    /** The node call message, e.g. "getTransactionProof". */
    public readonly method: string
    /** The node's result code, e.g. 404, 409, 410 or 503. */
    public readonly result: number
    /** The node's `extra.reason`, e.g. "not_found"; undefined when it gives none. */
    public readonly reason: string | undefined
    /** The response body, which can still carry data (e.g. `checkedThroughBlock`). */
    public readonly response: unknown
    public readonly extra: unknown

    constructor(method: string, reply: RPCResponse) {
        const reason =
            typeof reply.extra?.reason === "string"
                ? reply.extra.reason
                : undefined
        const error =
            reply.response && typeof reply.response === "object"
                ? reply.response.error
                : reply.response
        super(
            `${method} refused with ${reply.result}: ${reason ?? String(error ?? "no reason")}`,
        )
        this.name = "NodeCallError"
        this.method = method
        this.result = reply.result
        this.reason = reason
        this.response = reply.response
        this.extra = reply.extra
    }
}
