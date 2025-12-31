/**
 * Key Server OAuth Types
 *
 * Types for OAuth verification flow with DAHR attestation.
 * Used by KeyServerClient to interact with the Key Server OAuth endpoints.
 */

/**
 * Supported OAuth providers
 */
export type OAuthService = "github" | "discord";

/**
 * Options for initiating an OAuth flow
 */
export interface OAuthInitOptions {
    /** Custom scopes to request (defaults to identity scopes) */
    scopes?: string[];
    /** Flow timeout in milliseconds (default: 600000 = 10min) */
    timeout?: number;
}

/**
 * Result from initiating an OAuth flow
 */
export interface OAuthInitResult {
    /** Whether the initiation was successful */
    success: boolean;
    /** URL for user to visit to authorize */
    authUrl: string;
    /** State identifier for polling */
    state: string;
    /** Unix timestamp when this flow expires */
    expiresAt: number;
}

/**
 * Status of an OAuth flow
 */
export type OAuthStatus = "pending" | "completed" | "failed" | "expired";

/**
 * User identity information from OAuth provider
 */
export interface OAuthUserInfo {
    /** OAuth provider */
    service: OAuthService;
    /** Provider's user ID */
    providerId: string;
    /** Provider's username */
    username: string;
    /** User email (if email scope was requested) */
    email?: string;
    /** User avatar URL */
    avatarUrl?: string;
    /** Unix timestamp when verification completed */
    verifiedAt: number;
}

/**
 * DAHR (Demos Attestation Hash Response) attestation
 * Cryptographic proof that the Key Server performed the verification
 */
export interface DAHRAttestation {
    /** SHA256 hash of the request payload */
    requestHash: string;
    /** SHA256 hash of the response payload */
    responseHash: string;
    /** Ed25519 signature over responseHash */
    signature: {
        type: "Ed25519";
        data: string;
    };
    /** Attestation metadata */
    metadata: {
        /** Session identifier */
        sessionId: string;
        /** Unix timestamp of attestation */
        timestamp: number;
        /** Key Server's public key (hex) */
        keyServerPubKey: string;
        /** Node's public key (hex) */
        nodePubKey: string;
        /** Key Server version */
        version: string;
    };
}

/**
 * Result from polling an OAuth flow
 */
export interface OAuthPollResult {
    /** Whether the request was successful */
    success: boolean;
    /** Current status of the OAuth flow */
    status: OAuthStatus;
    /** User info (only present when status is "completed") */
    result?: OAuthUserInfo;
    /** DAHR attestation (only present when status is "completed") */
    attestation?: DAHRAttestation;
    /** Error details (only present when status is "failed" or "expired") */
    error?: {
        code: string;
        message: string;
    };
}

/**
 * Options for the convenience verifyOAuth method
 */
export interface OAuthVerifyOptions extends OAuthInitOptions {
    /**
     * Called when auth URL is ready - dApp should display this to user
     */
    onAuthUrl?: (authUrl: string, state: string) => void;

    /**
     * Polling interval in milliseconds (default: 2000)
     */
    pollInterval?: number;

    /**
     * Called on each poll attempt (for UI feedback)
     */
    onPoll?: (attempt: number, status: OAuthStatus) => void;
}

/**
 * Result from the convenience verifyOAuth method
 */
export interface OAuthVerificationResult {
    /** Whether verification was successful */
    success: boolean;
    /** Verified user information */
    user: OAuthUserInfo;
    /** DAHR attestation proving the verification */
    attestation: DAHRAttestation;
}

/**
 * Key Server client configuration
 */
export interface KeyServerClientConfig {
    /** Key Server endpoint URL */
    endpoint: string;
    /** Node's public key (hex-encoded Ed25519) */
    nodePubKey: string;
}

/**
 * Response from GET /oauth/providers
 */
export interface OAuthProvidersResponse {
    success: boolean;
    providers?: OAuthService[];
    error?: {
        code: string;
        message: string;
    };
}
