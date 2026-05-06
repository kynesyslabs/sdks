/**
 * Thrown by `DemosTransactions.broadcastAndWait` when the broadcast itself
 * could not reach the node (no server contact at all). Distinct from
 * `BroadcastTimeoutError`, which means the broadcast was accepted by the
 * transport but the SDK never observed a terminal state within the timeout.
 *
 * Only raised when the caller opts in via `failFastOnBroadcastError: true`.
 * The default behavior (lenient) preserves the previous "keep polling and
 * eventually time out" semantics so existing consumers see no change.
 *
 * `cause` is the underlying transport error (typically an AxiosError) so
 * callers can inspect `.code`, `.response`, etc.
 */
export class BroadcastFailedError extends Error {
    public readonly txHash: string
    public override readonly cause: unknown

    constructor(opts: { txHash: string; cause: unknown; message?: string }) {
        const causeMessage =
            (opts.cause as any)?.message ?? String(opts.cause ?? "unknown")
        super(
            opts.message ??
                `Broadcast failed before inclusion polling could begin (txHash=${opts.txHash}): ${causeMessage}`,
        )
        this.name = "BroadcastFailedError"
        this.txHash = opts.txHash
        this.cause = opts.cause
    }
}
