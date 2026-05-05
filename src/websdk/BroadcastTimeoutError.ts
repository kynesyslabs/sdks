/**
 * Thrown by `DemosTransactions.broadcastAndWait` when a broadcast tx has not
 * been observed in a terminal state (`included` or `failed`) before the
 * configured timeout elapses.
 *
 * The broadcast itself may have succeeded - this only indicates that the
 * SDK gave up waiting. Callers can resume polling on their own using the
 * preserved `txHash` and `lastSeenState`.
 */
export class BroadcastTimeoutError extends Error {
    public readonly txHash: string
    public readonly lastSeenState: string
    public readonly elapsedMs: number

    constructor(opts: {
        txHash: string
        lastSeenState: string
        elapsedMs: number
    }) {
        super(
            `Broadcast timed out after ${opts.elapsedMs}ms (txHash=${opts.txHash}, lastSeenState=${opts.lastSeenState})`,
        )
        this.name = "BroadcastTimeoutError"
        this.txHash = opts.txHash
        this.lastSeenState = opts.lastSeenState
        this.elapsedMs = opts.elapsedMs
    }
}
