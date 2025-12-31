/**
 * Key Server Module
 *
 * Client for Key Server OAuth verification with DAHR attestation.
 * Enables dApps to verify user ownership of GitHub/Discord accounts.
 *
 * @example
 * ```typescript
 * import { KeyServerClient } from "@kynesyslabs/demosdk/keyserver";
 *
 * const client = new KeyServerClient({
 *     endpoint: "http://localhost:3030",
 *     nodePubKey: nodePublicKey,
 * });
 *
 * // Full verification flow
 * const result = await client.verifyOAuth("github", {
 *     onAuthUrl: (url) => window.open(url),
 *     onPoll: (attempt, status) => console.log(`Poll ${attempt}: ${status}`),
 * });
 *
 * console.log("Verified user:", result.user.username);
 * console.log("Attestation:", result.attestation);
 * ```
 */

export { KeyServerClient } from "./KeyServerClient";
export { OAuthError } from "./errors";
export { verifyAttestation, verifyOAuthAttestation } from "./verification";
export type { OAuthErrorCode } from "./errors";
export type {
    VerifyAttestationOptions,
    AttestationVerificationResult,
} from "./verification";
export type {
    KeyServerClientConfig,
    OAuthService,
    OAuthInitOptions,
    OAuthInitResult,
    OAuthPollResult,
    OAuthVerifyOptions,
    OAuthVerificationResult,
    OAuthStatus,
    OAuthUserInfo,
    DAHRAttestation,
    OAuthProvidersResponse,
    WalletBinding,
} from "./types";
