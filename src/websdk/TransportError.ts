/**
 * Thrown by the SDK transport layer when an HTTP request to the Demos node
 * exhausts its retry budget. This is intentionally small and local - we
 * don't want a hierarchy of transport errors at this layer.
 *
 * `attempts` is the total number of attempts that were made (including the
 * final failing one). `cause` is the underlying error (typically an
 * AxiosError) so callers can inspect `.response`, `.code`, etc.
 */
export class TransportError extends Error {
    public readonly attempts: number
    public readonly cause: unknown

    constructor(message: string, opts: { cause: unknown; attempts: number }) {
        super(message)
        this.name = "TransportError"
        this.attempts = opts.attempts
        this.cause = opts.cause
    }
}
