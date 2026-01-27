/**
 * Key Server OAuth Errors
 */

/**
 * Error codes for OAuth operations
 */
export type OAuthErrorCode =
    | "OAUTH_INVALID_SERVICE"
    | "OAUTH_NOT_CONFIGURED"
    | "OAUTH_NOT_AVAILABLE"
    | "OAUTH_DENIED"
    | "OAUTH_EXPIRED"
    | "OAUTH_PROVIDER_ERROR"
    | "OAUTH_STATE_NOT_FOUND"
    | "OAUTH_STATE_MISMATCH"
    | "OAUTH_TIMEOUT"
    | "NETWORK_ERROR"
    | "INTERNAL_ERROR";

/**
 * OAuth-specific error class
 */
export class OAuthError extends Error {
    public readonly code: OAuthErrorCode;
    public readonly details?: Record<string, unknown>;

    constructor(
        code: OAuthErrorCode,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "OAuthError";
        this.code = code;
        this.details = details;

        // Maintains proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, OAuthError);
        }
    }

    /**
     * Create error from Key Server error response
     */
    static fromResponse(error: {
        code: string;
        message: string;
    }): OAuthError {
        return new OAuthError(
            error.code as OAuthErrorCode,
            error.message,
        );
    }
}
