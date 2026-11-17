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
 * import { TLSNotaryService } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * // A proxy session is opened for a paid tlsn_request, by its sender:
 * const service = new TLSNotaryService(demos);
 * const { tlsn } = await service.createTLSNotary({
 *   targetUrl: 'https://api.github.com/users/octocat',
 * });
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

import { Buffer } from "buffer"
import * as Comlink from "comlink"
import { checkNotaryKey } from "./notaryKey"
import { spawnTlsnWorker } from "./spawnWorker"
import { NotaryServer, Transcript } from "./tlsn-runtime"
import {
    buildBindValue,
    computeRevealRanges,
    enforceRevealPolicy,
    withBindHeader,
} from "./revealPolicy"
import type {
    Prover as TProver,
    Presentation as TPresentation,
    Commit,
    Method,
} from "tlsn-js"
import type { PresentationJSON } from "tlsn-js/build/types.js"

import type {
    TLSNotaryConfig,
    AttestRequest,
    AttestResult,
    CommitRanges,
    VerificationResult,
    AttestOptions,
    StatusCallback,
    TranscriptInfo,
} from "@/tlsnotary/types"

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
        if (typeof Worker === "undefined") {
            throw new Error(
                "TLSNotary initialization requires a browser or Web Worker runtime.",
            )
        }

        this.initializingPromise = (async () => {
            try {
                this.worker = spawnTlsnWorker()

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
     * The proxy session URL this instance attests through.
     *
     * Nodes open a proxy only for a call signed by the account that sent the
     * `tlsn_request`, so an instance cannot ask for one itself; the session
     * comes from `TLSNotaryService` and is used as returned.
     */
    private getProxyUrl(): string {
        if (this.config.websocketProxyUrl) {
            return this.config.websocketProxyUrl
        }
        throw new Error(
            "No proxy session configured. Nodes open a TLSNotary proxy only for a " +
                "signed request from the account that paid for the tlsn_request: use " +
                "TLSNotaryService.createTLSNotary(), or pass the proxyUrl from " +
                "TLSNotaryService.requestAttestation() as websocketProxyUrl.",
        )
    }

    /**
     * Attest an HTTPS request using the step-by-step method
     *
     * This provides full control over the attestation process including
     * custom commit ranges for selective disclosure.
     *
     * Without `commit`, the reveal ranges are computed from the transcript:
     * the request line, `Host` and the `X-Demos-Bind` header in full, other
     * headers by name (credential headers such as `Authorization` and
     * `Cookie` always by name only), and the response with its body
     * (`Set-Cookie` by name only). A caller's `commit` is checked against
     * the same rules: the request line, `Host` and bind header are added,
     * and a range over a credential value throws before notarisation.
     *
     * The notary signs the time of the attestation. Nodes refuse a store or
     * identity link of the result once it is older than
     * `TLSN_ATTESTATION_MAX_AGE_SECONDS` (3600 s on mainnet) at the time of
     * its block, so submit it right away.
     *
     * @param request - Request configuration (URL, method, headers, body)
     * @param commit - Optional commit ranges for selective disclosure
     * @param onStatus - Optional status callback for progress updates
     * @returns Attestation result with proof and verification
     * @throws {NotaryKeyMismatchError} when the notary that signed is not trusted
     *
     * @example
     * ```typescript
     * const result = await tlsn.attest({
     *   url: 'https://api.example.com/user',
     *   method: 'GET',
     *   // Revealed as "authorization: " with the value hidden
     *   headers: { 'Authorization': 'Bearer token' },
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

        // Step 1: The proxy session opened for this attestation's token
        const proxyUrl = this.getProxyUrl()

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
            const headers = this.requestHeaders(request)

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

            // Step 7: Create commit ranges (what to reveal). Header order
            // differs per run, so the ranges come from these exact bytes.
            status("Creating attestation commitment...")
            const commitRanges: Commit = commit
                ? enforceRevealPolicy(sent, recv, commit)
                : computeRevealRanges(sent, recv, {
                      revealResponseBody: request.revealResponseBody,
                  })

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
        // tlsn-js's one-shot Prover.notarize takes the reveal ranges before
        // the transcript exists, so it can only use fixed offsets. Going
        // through attest() computes them from the bytes actually sent.
        const { onStatus, commit, ...request } = options
        return this.attest(request, commit, onStatus)
    }

    /**
     * Verify a presentation/proof
     *
     * Can be used to verify proofs from other sources.
     * Offline when a notary key is pinned (`trustedNotaryKeys` or `notaryPublicKey`).
     *
     * @param presentationJSON - The presentation to verify
     * @returns Verification result with extracted data
     * @throws {NotaryKeyMismatchError} When the presentation was signed by a
     * notary other than the trusted ones: `trustedNotaryKeys` and
     * `notaryPublicKey`, or, when neither is set, the key the configured
     * notary serves (verification throws if it cannot be read). A presentation
     * proves that *some* notary signed the transcript, so this is the check
     * that makes it evidence — catch it to tell that apart from a malformed
     * proof. Exported from `@kynesyslabs/demosdk/tlsnotary`.
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

            const verifyingKey = Buffer.from(vk.data).toString("hex")
            const notaryKey = checkNotaryKey(
                verifyingKey,
                await this.trustedKeys(),
            )

            return {
                time: verifierOutput.connection_info.time,
                serverName: verifierOutput.server_name,
                sent: transcript.sent(),
                recv: transcript.recv(),
                notaryKey,
                verifyingKey,
            }
        } finally {
            // Free WASM memory to prevent leaks
            if (proof) {
                await proof.free()
            }
        }
    }

    /**
     * Headers of the notarised request, with the bind header when this
     * instance is bound to a sender and a `tlsn_request`.
     */
    private requestHeaders(request: AttestRequest): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/json",
            ...request.headers,
        }
        return this.config.binding
            ? withBindHeader(headers, buildBindValue(this.config.binding))
            : headers
    }

    /**
     * The keys a presentation may be signed by: the pinned ones, or the key
     * the configured notary serves when nothing is pinned.
     */
    private async trustedKeys(): Promise<string[]> {
        const pinned = [
            ...(this.config.trustedNotaryKeys ?? []),
            ...(this.config.notaryPublicKey ? [this.config.notaryPublicKey] : []),
        ]
        if (pinned.length > 0) return pinned
        try {
            const notary = NotaryServer.from(this.config.notaryUrl)
            return [await notary.publicKey("hex")]
        } catch (error) {
            // Without a key to compare against, a presentation proves only
            // that some notary signed it, so verification cannot succeed.
            throw new Error(
                "TLSNotary verify needs a trusted notary key: pin notaryPublicKey or trustedNotaryKeys, or reach the notary to read its key. " +
                    (error instanceof Error ? error.message : String(error)),
            )
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

        const proxyUrl = this.getProxyUrl()

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
                headers: this.requestHeaders(request),
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
