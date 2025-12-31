/**
 * Key Server Client
 *
 * Client for interacting with Key Server OAuth endpoints.
 * Enables dApps to verify user ownership of GitHub/Discord accounts
 * with DAHR attestation.
 */

import type {
    KeyServerClientConfig,
    OAuthService,
    OAuthInitOptions,
    OAuthInitResult,
    OAuthPollResult,
    OAuthVerifyOptions,
    OAuthVerificationResult,
    OAuthProvidersResponse,
    OAuthStatus,
    WalletBinding,
} from "./types";
import { OAuthError } from "./errors";

const DEFAULT_TIMEOUT = 600000; // 10 minutes
const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds

export class KeyServerClient {
    private readonly endpoint: string;
    private readonly nodePubKey: string;
    private readonly defaultWalletAddress?: string;

    constructor(config: KeyServerClientConfig) {
        // Normalize endpoint (remove trailing slash)
        this.endpoint = config.endpoint.replace(/\/$/, "");
        this.nodePubKey = config.nodePubKey;
        this.defaultWalletAddress = config.defaultWalletAddress;
    }

    /**
     * Get list of available OAuth providers
     *
     * @returns Array of available provider names
     * @throws OAuthError if request fails
     */
    async getProviders(): Promise<OAuthService[]> {
        const response = await this.fetch<OAuthProvidersResponse>(
            "/oauth/providers",
            { method: "GET" },
        );

        if (!response.success || !response.providers) {
            throw new OAuthError(
                "OAUTH_NOT_AVAILABLE",
                response.error?.message || "Failed to get providers",
            );
        }

        return response.providers;
    }

    /**
     * Initiate an OAuth verification flow
     *
     * @param service - OAuth provider ("github" or "discord")
     * @param options - Optional configuration
     * @returns OAuth flow initiation result with authUrl and state
     * @throws OAuthError if initiation fails
     */
    async initiateOAuth(
        service: OAuthService,
        options?: OAuthInitOptions,
    ): Promise<OAuthInitResult> {
        const response = await this.fetch<OAuthInitResult & { error?: { code: string; message: string } }>(
            "/oauth/init",
            {
                method: "POST",
                body: JSON.stringify({
                    service,
                    nodePubKey: this.nodePubKey,
                    scopes: options?.scopes,
                }),
            },
        );

        if (!response.success) {
            throw OAuthError.fromResponse(
                response.error || { code: "INTERNAL_ERROR", message: "Unknown error" },
            );
        }

        return {
            success: true,
            authUrl: response.authUrl,
            state: response.state,
            expiresAt: response.expiresAt,
        };
    }

    /**
     * Poll for OAuth verification result
     *
     * @param state - State identifier from initiateOAuth
     * @param walletBinding - Optional wallet binding with signature proving ownership
     * @returns Current status of the OAuth flow
     * @throws OAuthError if polling fails
     */
    async pollOAuth(state: string, walletBinding?: WalletBinding): Promise<OAuthPollResult> {
        const response = await this.fetch<OAuthPollResult>(
            "/oauth/poll",
            {
                method: "POST",
                body: JSON.stringify({
                    state,
                    nodePubKey: this.nodePubKey,
                    walletBinding,
                }),
            },
        );

        return response;
    }

    /**
     * Convenience method: initiate OAuth and wait for completion
     *
     * This method handles the full OAuth flow:
     * 1. Initiates the OAuth flow
     * 2. Calls onAuthUrl callback for dApp to display the URL
     * 3. Resolves wallet binding (if provided as function, calls with state)
     * 4. Polls until completion, timeout, or failure
     * 5. Returns the verified user info and attestation
     *
     * @param service - OAuth provider ("github" or "discord")
     * @param options - Configuration including callbacks
     * @returns Final verification result
     * @throws OAuthError if verification fails or times out
     */
    async verifyOAuth(
        service: OAuthService,
        options?: OAuthVerifyOptions,
    ): Promise<OAuthVerificationResult> {
        const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
        const pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL;

        // Step 1: Initiate OAuth flow
        const initResult = await this.initiateOAuth(service, {
            scopes: options?.scopes,
            timeout,
        });

        // Step 2: Notify dApp of auth URL
        if (options?.onAuthUrl) {
            options.onAuthUrl(initResult.authUrl, initResult.state);
        }

        // Step 3: Resolve wallet binding
        let walletBinding: WalletBinding | undefined;
        if (options?.walletBinding) {
            if (typeof options.walletBinding === "function") {
                // Call the async function with state to get wallet binding
                walletBinding = await options.walletBinding(initResult.state);
            } else {
                walletBinding = options.walletBinding;
            }
        }

        // Step 4: Poll for result
        const startTime = Date.now();
        let attempt = 0;

        while (Date.now() - startTime < timeout) {
            attempt++;

            // Wait before polling (except first attempt)
            if (attempt > 1) {
                await this.sleep(pollInterval);
            }

            const pollResult = await this.pollOAuth(initResult.state, walletBinding);

            // Notify dApp of poll status
            if (options?.onPoll) {
                options.onPoll(attempt, pollResult.status);
            }

            // Check for terminal states
            switch (pollResult.status) {
                case "completed":
                    if (!pollResult.result || !pollResult.attestation) {
                        throw new OAuthError(
                            "INTERNAL_ERROR",
                            "Completed but missing result or attestation",
                        );
                    }
                    return {
                        success: true,
                        user: pollResult.result,
                        attestation: pollResult.attestation,
                    };

                case "failed":
                    throw OAuthError.fromResponse(
                        pollResult.error || { code: "OAUTH_PROVIDER_ERROR", message: "Verification failed" },
                    );

                case "expired":
                    throw new OAuthError(
                        "OAUTH_EXPIRED",
                        "OAuth flow expired",
                    );

                case "pending":
                    // Continue polling
                    break;
            }
        }

        // Timeout reached
        throw new OAuthError(
            "OAUTH_TIMEOUT",
            `OAuth verification timed out after ${timeout}ms`,
        );
    }

    /**
     * Internal fetch wrapper with error handling
     */
    private async fetch<T>(
        path: string,
        options: RequestInit,
    ): Promise<T> {
        const url = `${this.endpoint}${path}`;

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            const data = await response.json();
            return data as T;
        } catch (error) {
            if (error instanceof OAuthError) {
                throw error;
            }

            throw new OAuthError(
                "NETWORK_ERROR",
                `Failed to connect to Key Server: ${(error as Error).message}`,
                { url, originalError: String(error) },
            );
        }
    }

    /**
     * Sleep utility for polling
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
