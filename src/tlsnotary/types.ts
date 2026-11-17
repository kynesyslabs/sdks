/**
 * TLSNotary Types
 *
 * TypeScript interfaces for the TLSNotary SDK module.
 */

import type { TLSNotaryBinding } from "./revealPolicy"

/**
 * Configuration for TLSNotary instance
 */
export interface TLSNotaryConfig {
    /** Notary server URL (e.g., 'wss://node.demos.sh:7047') */
    notaryUrl: string
    /**
     * The proxy session URL a node returned for this attestation's
     * `tlsn_request` (`TLSNotaryService.requestAttestation` returns it as
     * `proxyUrl`; `createTLSNotary` sets it). It ends in the session's secret
     * id and is used exactly as returned.
     */
    websocketProxyUrl?: string
    /**
     * @deprecated Ignored. Nodes open a proxy only for a call signed by the
     * account that sent the `tlsn_request`, which a TLSNotary instance cannot
     * sign; use `TLSNotaryService.createTLSNotary`, or pass the `proxyUrl`
     * from `requestAttestation` as `websocketProxyUrl`.
     */
    rpcUrl?: string
    /** Notary's public key (hex string) for verification */
    notaryPublicKey?: string
    /**
     * Notary keys a presentation may be signed by. `verify()` refuses any
     * other signer. Combined with `notaryPublicKey` when both are set.
     */
    trustedNotaryKeys?: string[]
    /**
     * Binds every attestation to a sender and its `tlsn_request`: the
     * `X-Demos-Bind` header is added to the request and always revealed.
     * Set by `TLSNotaryService.createTLSNotary`.
     */
    binding?: TLSNotaryBinding
    /** Logging level: 'Debug' | 'Info' | 'Warn' | 'Error' */
    loggingLevel?: "Debug" | "Info" | "Warn" | "Error"
}

/**
 * Response from the requestTLSNproxy nodeCall
 */
export interface ProxyRequestResponse {
    /**
     * WebSocket URL of this session. Its last path segment is the session's
     * secret id, so it is used as returned and not shared.
     */
    websocketProxyUrl: string
    /** Target domain the proxy relays to */
    targetDomain: string
    /** Milliseconds until the session ends, whatever it relays */
    expiresIn: number
    /** Public id of the session */
    proxyId: string
    /** Bytes the session relays to the target before it ends */
    maxSentBytes?: number
    /** Bytes the session relays from the target before it ends */
    maxRecvBytes?: number
    /** The token the session was opened for: the `tlsn_request` hash */
    tokenId?: string
    /** Sessions the token can still open */
    retriesLeft?: number
}

/**
 * Error response from requestTLSNproxy RPC call
 */
export interface ProxyRequestError {
    /** HTTP-style status of the refusal (e.g., 400, 403, 429) */
    status?: number
    /** Error code (e.g., 'INVALID_TOKEN', 'TOKEN_OWNER_MISMATCH') */
    error: string
    /** Human-readable error message */
    message: string
    /** Target domain that failed */
    targetDomain?: string
    /** Last error details for spawn failures */
    lastError?: string
}

/**
 * Discovery response from node's nodeCall
 */
export interface TLSNotaryDiscoveryInfo {
    /** Notary WebSocket URL */
    notaryUrl: string
    /**
     * @deprecated A fixed proxy port nodes no longer listen on; still
     * reported for old clients. Proxies are per-session URLs from
     * `TLSNotaryService.requestAttestation`.
     */
    proxyUrl: string
    /** Notary's public key (hex) */
    publicKey: string
    /** TLSNotary version */
    version: string
}

/**
 * Request configuration for attestation
 */
export interface AttestRequest {
    /** Target HTTPS URL to attest */
    url: string
    /** HTTP method (default: 'GET') */
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
    /** Request headers */
    headers?: Record<string, string>
    /** Request body (for POST/PUT/PATCH) */
    body?: string | object
    /** Max bytes to send (default: 16384) */
    maxSentData?: number
    /** Max bytes to receive (default: 16384) */
    maxRecvData?: number
    /**
     * Reveal the response body (default true). Identity links need it; a
     * stored proof is public, so turn it off or pass `commit.recv` when the
     * body is private.
     */
    revealResponseBody?: boolean
}

/**
 * Byte range for selective disclosure
 */
export interface Range {
    /** Start byte offset (inclusive) */
    start: number
    /** End byte offset (exclusive) */
    end: number
}

/**
 * Commit ranges for selective disclosure
 */
export interface CommitRanges {
    /** Byte ranges of sent data to reveal */
    sent: Range[]
    /** Byte ranges of received data to reveal */
    recv: Range[]
}

// Import and re-export PresentationJSON from tlsn-js types
import type { PresentationJSON } from "tlsn-js/build/types.js"
export type { PresentationJSON }

/**
 * Transcript information from the TLS session
 */
export interface TranscriptInfo {
    /** Raw bytes sent (as number array from WASM) */
    sent: number[]
    /** Raw bytes received (as number array from WASM) */
    recv: number[]
}

/**
 * Result of attestation verification
 */
export interface VerificationResult {
    /** Unix timestamp of the TLS session */
    time: number
    /** Verified server name (e.g., 'api.github.com') */
    serverName: string
    /** Revealed sent data as string */
    sent: string
    /** Revealed received data as string */
    recv: string
    /** Notary's public key (hex) */
    notaryKey: string
    /** Verifying key from the proof (hex) */
    verifyingKey: string
}

/**
 * Complete attestation result
 */
export interface AttestResult {
    /** Presentation JSON (the proof) */
    presentation: PresentationJSON
    /** Verification result */
    verification: VerificationResult
}

/**
 * Status callback for progress updates during attestation
 */
export type StatusCallback = (status: string) => void

/**
 * Options for attestation with additional controls
 */
export interface AttestOptions extends AttestRequest {
    /** Custom commit ranges for selective disclosure */
    commit?: CommitRanges
    /** Status callback for progress updates */
    onStatus?: StatusCallback
}
