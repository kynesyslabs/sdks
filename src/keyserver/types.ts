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
 * Wallet binding for OAuth verification.
 * Proves ownership of a wallet address during OAuth flow.
 */
export interface WalletBinding {
    /** The wallet address to bind to this OAuth verification */
    address: string;
    /**
     * Signature proving ownership of the wallet address.
     * The message signed should be: "demos-oauth-bind:{state}" where state is from initiateOAuth.
     * For EVM: personal_sign or eth_sign
     * For Solana: signMessage
     */
    signature: string;
    /** Signature scheme used (for verification on receiving end) */
    signatureType: "evm" | "solana" | "ed25519";
}

/**
 * Options for initiating an OAuth flow
 */
export interface OAuthInitOptions {
    /** Custom scopes to request (defaults to identity scopes) */
    scopes?: string[];
    /** Flow timeout in milliseconds (default: 600000 = 10min) */
    timeout?: number;
    /**
     * Wallet address to associate with this OAuth verification.
     * This address will be included in the DAHR attestation metadata.
     * Overrides defaultWalletAddress from KeyServerClientConfig if both are set.
     * @deprecated Use walletBinding for signed wallet proof instead
     */
    walletAddress?: string;
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
        /**
         * Wallet binding included in the attestation.
         * Contains the wallet address and signature proving ownership.
         * The Key Server verifies this signature before including it.
         */
        walletBinding?: WalletBinding;
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
     * Called when auth URL is ready - dApp should display this to user.
     * The state is needed for wallet binding signature.
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

    /**
     * Wallet binding with signature proving ownership.
     * The signature message format is: "demos-oauth-bind:{state}"
     * This is called after initiateOAuth to get the state for signing.
     *
     * @example
     * ```typescript
     * const result = await client.verifyOAuth("github", {
     *     onAuthUrl: async (authUrl, state) => {
     *         // Sign with user's wallet
     *         const message = `demos-oauth-bind:${state}`;
     *         const signature = await wallet.signMessage(message);
     *         return { address: wallet.address, signature, signatureType: "evm" };
     *     },
     * });
     * ```
     */
    walletBinding?: WalletBinding | ((state: string) => Promise<WalletBinding>);
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
    /**
     * Default wallet address to associate with OAuth verifications.
     * Can be overridden per-request via OAuthInitOptions.walletAddress.
     */
    defaultWalletAddress?: string;
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
