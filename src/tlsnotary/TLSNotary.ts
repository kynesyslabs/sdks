/**
 * TLSNotary - Browser-based HTTPS Attestation
 *
 * This module provides TLSNotary attestation capabilities for the Demos SDK.
 * It runs the TLSNotary Prover in a Web Worker using WASM, communicates with
 * a Notary server, and produces cryptographic proofs of HTTPS requests.
 *
 * NOTE: This module is browser-only. It requires Web Workers and WASM support.
 *
 * @example
 * ```typescript
 * import { TLSNotary } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * // Option 1: Explicit configuration
 * const tlsn = new TLSNotary({
 *   notaryUrl: 'wss://node.demos.sh:7047',
 *   websocketProxyUrl: 'wss://node.demos.sh:55688',
 * });
 *
 * // Option 2: Discovery via Demos instance (preferred)
 * const demos = new Demos({ rpc: 'https://node.demos.sh' });
 * const tlsn = await demos.tlsnotary();
 *
 * await tlsn.initialize();
 *
 * const result = await tlsn.attest({
 *   url: 'https://api.github.com/users/octocat',
 *   headers: { 'User-Agent': 'DemosSDK' },
 * });
 *
 * console.log('Verified server:', result.verification.serverName);
 * console.log('Response:', result.verification.recv);
 * ```
 */

import * as Comlink from "comlink"
import {
    Prover as TProver,
    Presentation as TPresentation,
    NotaryServer,
    Transcript,
    type Commit,
    type Method,
} from "tlsn-js"
import type { PresentationJSON } from "tlsn-js/build/types"

import type {
    TLSNotaryConfig,
    AttestRequest,
    AttestResult,
    CommitRanges,
    VerificationResult,
    AttestOptions,
    StatusCallback,
    TranscriptInfo,
    ProxyRequestResponse,
    ProxyRequestError,
} from "@/tlsnotary/types"
import axios from "axios"

/**
 * TLSNotary class for browser-based HTTPS attestation
 *
 * This class handles:
 * - Running the Prover (MPC-TLS client) in the browser via WASM
 * - Communicating with the Demos Node's Notary server
 * - Attesting HTTPS requests with cryptographic proofs
 * - Verifying attestations offline
 */
export class TLSNotary {
    private config: TLSNotaryConfig
    private worker: Worker | null = null
    // Using any for Comlink wrapper as types are lost across the worker boundary
    private wasm: any = null
    private initialized = false
    private initializingPromise: Promise<void> | null = null

    /**
     * Create a new TLSNotary instance
     *
     * @param config - Configuration with notary and proxy URLs
     */
    constructor(config: TLSNotaryConfig) {
        this.config = {
            loggingLevel: "Info",
            ...config,
            // Normalize notary URL: tlsn-js uses HTTP to fetch session URL
            // Convert ws:// to http:// and wss:// to https://
            notaryUrl: this.normalizeNotaryUrl(config.notaryUrl),
        }
    }

    /**
     * Normalize notary URL for HTTP requests
     *
     * The NotaryServer.sessionUrl() method uses HTTP/HTTPS to fetch the session URL.
     * If the notary URL is provided as ws:// or wss://, convert it to http:// or https://.
     *
     * @param url - The notary URL (may be ws://, wss://, http://, or https://)
     * @returns The normalized URL using http:// or https://
     */
    private normalizeNotaryUrl(url: string): string {
        if (url.startsWith("ws://")) {
            return url.replace("ws://", "http://")
        }
        if (url.startsWith("wss://")) {
            return url.replace("wss://", "https://")
        }
        return url
    }

    /**
     * Initialize the WASM module
     *
     * Must be called before any attestation operations.
     * Only needs to be called once per page load.
     *
     * @throws Error if WASM initialization fails
     */
    async initialize(): Promise<void> {
        if (this.initialized) return
        if (this.initializingPromise) return this.initializingPromise

        this.initializingPromise = (async () => {
            try {
                // Create Web Worker for WASM operations
                // Note: This requires a bundler that supports worker URLs (webpack, vite, etc.)
                // Using .js extension for compatibility with compiled output
                // @ts-expect-error - import.meta.url is browser-only and requires ESNext module
                this.worker = new Worker(new URL("./worker.js", import.meta.url), {
                    type: "module",
                })

                this.wasm = Comlink.wrap(this.worker)

                // Initialize WASM with logging level
                await this.wasm.init({ loggingLevel: this.config.loggingLevel })
                this.initialized = true
            } catch (e) {
                // Clean up partially created resources
                if (this.worker) {
                    this.worker.terminate()
                    this.worker = null
                }
                this.wasm = null
                this.initialized = false
                // Reset promise to allow retries on failure
                this.initializingPromise = null
                throw e
            }
        })()

        return this.initializingPromise
    }

    /**
     * Request a dynamic WebSocket proxy for a target URL
     *
     * This method calls the node's `requestTLSNproxy` endpoint to get a
     * dynamically allocated proxy for the specific target domain.
     * Proxies auto-expire after 30 seconds of inactivity.
     *
     * @param targetUrl - The HTTPS URL to create a proxy for
     * @returns Proxy response with websocketProxyUrl
     * @throws Error if RPC URL is not configured or proxy request fails
     *
     * @internal This is called automatically by attest/attestQuick methods
     */
    private async requestProxy(targetUrl: string): Promise<ProxyRequestResponse> {
        if (!this.config.rpcUrl) {
            // Fallback to static proxy if no RPC URL configured (legacy mode)
            if (this.config.websocketProxyUrl) {
                const url = new URL(targetUrl)
                return {
                    websocketProxyUrl: this.config.websocketProxyUrl,
                    targetDomain: url.hostname,
                    expiresIn: 0, // Static proxy doesn't expire
                    proxyId: "static",
                }
            }
            throw new Error(
                "No RPC URL configured for dynamic proxy requests. " +
                    "Either provide rpcUrl in config or use Demos.tlsnotary() for auto-configuration.",
            )
        }

        try {
            const response = await axios.post(this.config.rpcUrl, {
                method: "nodeCall",
                params: [
                    {
                        message: "requestTLSNproxy",
                        data: { targetUrl },
                    },
                ],
            })

            const result = response.data

            if (result.result !== 200) {
                const error = result.response as ProxyRequestError
                throw new Error(
                    `Failed to request proxy: ${error.message || error.error || "Unknown error"}`,
                )
            }

            return result.response as ProxyRequestResponse
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Proxy request failed: ${error.message}`)
            }
            throw error
        }
    }

    /**
     * Get the WebSocket proxy URL for a target URL
     *
     * Automatically requests a dynamic proxy from the node if rpcUrl is configured,
     * otherwise falls back to the static websocketProxyUrl.
     *
     * @param targetUrl - The target HTTPS URL
     * @param onStatus - Optional status callback
     * @returns The websocket proxy URL to use
     */
    private async getProxyUrl(
        targetUrl: string,
        onStatus?: StatusCallback,
    ): Promise<string> {
        const status = onStatus || (() => {})

        // If we have rpcUrl, always request a dynamic proxy
        if (this.config.rpcUrl) {
            status("Requesting WebSocket proxy...")
            const proxyResponse = await this.requestProxy(targetUrl)
            status(`Proxy allocated for ${proxyResponse.targetDomain}`)
            return proxyResponse.websocketProxyUrl
        }

        // Fallback to static proxy URL (legacy/explicit config mode)
        if (this.config.websocketProxyUrl) {
            return this.config.websocketProxyUrl
        }

        throw new Error(
            "No proxy configuration available. " +
                "Configure rpcUrl for dynamic proxies or websocketProxyUrl for static proxy.",
        )
    }

    /**
     * Attest an HTTPS request using the step-by-step method
     *
     * This provides full control over the attestation process including
     * custom commit ranges for selective disclosure.
     *
     * @param request - Request configuration (URL, method, headers, body)
     * @param commit - Optional commit ranges for selective disclosure
     * @param onStatus - Optional status callback for progress updates
     * @returns Attestation result with proof and verification
     *
     * @example
     * ```typescript
     * const result = await tlsn.attest({
     *   url: 'https://api.example.com/user',
     *   method: 'GET',
     *   headers: { 'Authorization': 'Bearer token' },
     * }, {
     *   // Hide authorization header in the proof
     *   sent: [{ start: 0, end: 50 }, { start: 100, end: 200 }],
     *   recv: [{ start: 0, end: 500 }],
     * });
     * ```
     */
    async attest(
        request: AttestRequest,
        commit?: CommitRanges,
        onStatus?: StatusCallback,
    ): Promise<AttestResult> {
        if (!this.initialized || !this.wasm) {
            throw new Error("TLSNotary not initialized. Call initialize() first.")
        }

        const status = onStatus || (() => {})

        // Extract server DNS from URL
        const url = new URL(request.url)
        const serverDns = url.hostname

        // Step 1: Request dynamic proxy for this target
        const proxyUrl = await this.getProxyUrl(request.url, status)

        // Step 2: Connect to Notary
        status("Connecting to Notary server...")
        const notary = NotaryServer.from(this.config.notaryUrl)

        // Step 3: Create Prover
        status("Creating Prover instance...")
        const prover = (await new this.wasm.Prover({
            serverDns,
            maxSentData: request.maxSentData || 16384,
            maxRecvData: request.maxRecvData || 16384,
        })) as TProver

        let presentation: TPresentation | null = null

        try {
            // Step 4: Setup MPC-TLS session
            status("Setting up MPC-TLS session...")
            await prover.setup(await notary.sessionUrl())

            // Step 5: Send the HTTPS request
            status(`Sending attested request to ${serverDns}...`)
            const headers: Record<string, string> = {
                Accept: "application/json",
                ...request.headers,
            }

            await prover.sendRequest(proxyUrl, {
                url: request.url,
                method: (request.method || "GET") as Method,
                headers,
                body: request.body,
            })

            // Step 6: Get transcript
            status("Getting transcript...")
            const transcript = await prover.transcript()
            const { sent, recv } = transcript

            // Step 7: Create commit ranges (what to reveal)
            status("Creating attestation commitment...")
            const commitRanges: Commit = commit || {
                sent: [{ start: 0, end: Math.min(sent.length, 200) }],
                recv: [{ start: 0, end: Math.min(recv.length, 300) }],
            }

            // Step 8: Notarize
            status("Generating attestation (this may take a moment)...")
            const notarizationOutputs = await prover.notarize(commitRanges)

            // Step 9: Create presentation
            status("Creating presentation...")
            presentation = (await new this.wasm.Presentation({
                attestationHex: notarizationOutputs.attestation,
                secretsHex: notarizationOutputs.secrets,
                notaryUrl: notarizationOutputs.notaryUrl,
                websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
                reveal: { ...commitRanges, server_identity: true },
            })) as TPresentation

            const presentationJSON = await presentation.json()

            // Step 10: Verify the presentation
            status("Verifying attestation...")
            const verification = await this.verify(presentationJSON)

            status("Attestation complete!")

            return {
                presentation: presentationJSON,
                verification,
            }
        } finally {
            // Free WASM memory to prevent leaks
            if (presentation) {
                await presentation.free()
            }
            if (prover) {
                await prover.free()
            }
        }
    }

    /**
     * Quick attestation using the helper method
     *
     * Simpler API with less control over the process.
     * Good for straightforward use cases.
     *
     * @param options - Attestation options including request and commit config
     * @returns Attestation result with proof and verification
     *
     * @example
     * ```typescript
     * const result = await tlsn.attestQuick({
     *   url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
     * });
     * ```
     */
    async attestQuick(options: AttestOptions): Promise<AttestResult> {
        if (!this.initialized || !this.wasm) {
            throw new Error("TLSNotary not initialized. Call initialize() first.")
        }

        const { onStatus, commit, ...request } = options
        const status = onStatus || (() => {})

        // Request dynamic proxy for this target
        const proxyUrl = await this.getProxyUrl(request.url, status)

        status("Running quick attestation...")

        const presentationJSON = await (
            this.wasm.Prover.notarize as typeof TProver.notarize
        )({
            notaryUrl: this.config.notaryUrl,
            websocketProxyUrl: proxyUrl,
            maxSentData: request.maxSentData || 16384,
            maxRecvData: request.maxRecvData || 16384,
            url: request.url,
            method: (request.method || "GET") as Method,
            headers: {
                Accept: "application/json",
                ...request.headers,
            },
            body: request.body,
            commit: commit || {
                sent: [{ start: 0, end: 100 }],
                recv: [{ start: 0, end: 200 }],
            },
            serverIdentity: true,
        })

        status("Verifying attestation...")
        const verification = await this.verify(presentationJSON)

        status("Quick attestation complete!")

        return {
            presentation: presentationJSON,
            verification,
        }
    }

    /**
     * Verify a presentation/proof
     *
     * Can be used to verify proofs from other sources.
     * This operation can be done offline.
     *
     * @param presentationJSON - The presentation to verify
     * @returns Verification result with extracted data
     *
     * @example
     * ```typescript
     * // Load a saved proof
     * const savedProof = JSON.parse(localStorage.getItem('proof'));
     * const result = await tlsn.verify(savedProof);
     *
     * console.log('Server:', result.serverName);
     * console.log('Time:', new Date(result.time * 1000));
     * console.log('Response:', result.recv);
     * ```
     */
    async verify(presentationJSON: PresentationJSON): Promise<VerificationResult> {
        if (!this.initialized || !this.wasm) {
            throw new Error("TLSNotary not initialized. Call initialize() first.")
        }

        const proof = (await new this.wasm.Presentation(
            presentationJSON.data,
        )) as TPresentation

        try {
            const verifierOutput = await proof.verify()

            const transcript = new Transcript({
                sent: verifierOutput.transcript?.sent || [],
                recv: verifierOutput.transcript?.recv || [],
            })

            const vk = await proof.verifyingKey()

            // Try to get notary key if available
            let notaryKey = "N/A"
            try {
                if (this.config.notaryPublicKey) {
                    notaryKey = this.config.notaryPublicKey
                } else {
                    const notary = NotaryServer.from(this.config.notaryUrl)
                    notaryKey = await notary.publicKey("hex")
                }
            } catch (error) {
                // Notary might not be running for offline verification
                console.warn(
                    "[TLSNotary] Could not fetch notary public key:",
                    error instanceof Error ? error.message : error,
                )
            }

            return {
                time: verifierOutput.connection_info.time,
                serverName: verifierOutput.server_name,
                sent: transcript.sent(),
                recv: transcript.recv(),
                notaryKey,
                verifyingKey: Buffer.from(vk.data).toString("hex"),
            }
        } finally {
            // Free WASM memory to prevent leaks
            if (proof) {
                await proof.free()
            }
        }
    }

    /**
     * Get the transcript from an attestation for inspection
     *
     * Useful for determining commit ranges for selective disclosure.
     *
     * @param request - Request to send (without creating attestation)
     * @returns Transcript with sent and received bytes
     */
    async getTranscript(request: AttestRequest): Promise<TranscriptInfo> {
        if (!this.initialized || !this.wasm) {
            throw new Error("TLSNotary not initialized. Call initialize() first.")
        }

        const url = new URL(request.url)
        const serverDns = url.hostname

        // Request dynamic proxy for this target
        const proxyUrl = await this.getProxyUrl(request.url)

        const notary = NotaryServer.from(this.config.notaryUrl)

        const prover = (await new this.wasm.Prover({
            serverDns,
            maxSentData: request.maxSentData || 16384,
            maxRecvData: request.maxRecvData || 16384,
        })) as TProver

        try {
            await prover.setup(await notary.sessionUrl())

            await prover.sendRequest(proxyUrl, {
                url: request.url,
                method: (request.method || "GET") as Method,
                headers: {
                    Accept: "application/json",
                    ...request.headers,
                },
                body: request.body,
            })

            const transcript = await prover.transcript()

            return {
                sent: transcript.sent,
                recv: transcript.recv,
            }
        } finally {
            // Free WASM memory to prevent leaks
            if (prover) {
                await prover.free()
            }
        }
    }

    /**
     * Cleanup resources
     *
     * Call when done with TLSNotary to release the Web Worker.
     */
    destroy(): void {
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
        }
        this.wasm = null
        this.initialized = false
    }

    /**
     * Check if WASM is initialized
     */
    isInitialized(): boolean {
        return this.initialized
    }

    /**
     * Get current configuration
     */
    getConfig(): TLSNotaryConfig {
        return { ...this.config }
    }

    /**
     * Update configuration
     *
     * Note: Changes take effect on next attestation.
     * If changing notary URL, you may want to re-initialize.
     */
    updateConfig(config: Partial<TLSNotaryConfig>): void {
        this.config = { ...this.config, ...config }
    }
}

export default TLSNotary
