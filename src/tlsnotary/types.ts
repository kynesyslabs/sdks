/**
 * TLSNotary Types
 *
 * TypeScript interfaces for the TLSNotary SDK module.
 */

/**
 * Configuration for TLSNotary instance
 */
export interface TLSNotaryConfig {
    /** Notary server URL (e.g., 'wss://node.demos.sh:7047') */
    notaryUrl: string
    /**
     * WebSocket proxy URL for TCP tunneling (e.g., 'wss://node.demos.sh:55688')
     * @deprecated Use rpcUrl instead - proxies are now dynamically allocated per-request
     */
    websocketProxyUrl?: string
    /** RPC URL for requesting dynamic proxies (e.g., 'https://node.demos.sh') */
    rpcUrl?: string
    /** Notary's public key (hex string) for verification */
    notaryPublicKey?: string
    /** Logging level: 'Debug' | 'Info' | 'Warn' | 'Error' */
    loggingLevel?: "Debug" | "Info" | "Warn" | "Error"
}

/**
 * Response from requestTLSNproxy RPC call
 */
export interface ProxyRequestResponse {
    /** Dynamic WebSocket proxy URL for this request */
    websocketProxyUrl: string
    /** Target domain the proxy is configured for */
    targetDomain: string
    /** Milliseconds until proxy expires (resets on activity) */
    expiresIn: number
    /** Unique proxy identifier */
    proxyId: string
}

/**
 * Error response from requestTLSNproxy RPC call
 */
export interface ProxyRequestError {
    /** Error code (e.g., 'INVALID_URL', 'PROXY_SPAWN_FAILED') */
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
    /** WebSocket proxy URL */
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
import type { PresentationJSON } from "tlsn-js/build/types"
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
