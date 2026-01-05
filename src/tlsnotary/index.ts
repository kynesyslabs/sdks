/**
 * TLSNotary SDK Module
 *
 * Browser-based HTTPS attestation using MPC-TLS with token-based management.
 *
 * @packageDocumentation
 * @module tlsnotary
 *
 * @example
 * ```typescript
 * import { TLSNotary, TLSNotaryService } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * const demos = new Demos();
 * await demos.connect('https://node.demos.sh');
 * await demos.connectWallet(mnemonic);
 *
 * // Token-based flow (recommended for production)
 * const service = new TLSNotaryService(demos);
 *
 * // 1. Request attestation token (burns 1 DEM)
 * const { proxyUrl, tokenId } = await service.requestAttestation({
 *   targetUrl: 'https://api.github.com/users/octocat'
 * });
 *
 * // 2. Perform attestation
 * const tlsn = await demos.tlsnotary();
 * const result = await tlsn.attest({
 *   url: 'https://api.github.com/users/octocat',
 * });
 *
 * // 3. Store proof on-chain (burns 1 + proof_size_kb DEM)
 * const { txHash } = await service.storeProof(
 *   tokenId,
 *   JSON.stringify(result.presentation),
 *   { storage: 'onchain' }
 * );
 *
 * console.log('Proof stored:', txHash);
 * ```
 *
 * @example Using low-level tlsn-js classes (re-exported for convenience)
 * ```typescript
 * import {
 *   Prover, Presentation, NotaryServer, Transcript,
 *   init as initTlsnWasm
 * } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * // Initialize WASM (required before using Prover/Presentation)
 * await initTlsnWasm({ loggingLevel: 'Info' });
 *
 * // Now you can use the classes directly without installing tlsn-js
 * const notary = NotaryServer.from('wss://notary.example.com');
 * const prover = await new Prover({ serverDns: 'api.example.com' });
 * ```
 */

// Core TLSNotary class for attestation
export { TLSNotary } from "./TLSNotary"

// TLSNotary Service for token management and proof storage
export {
    TLSNotaryService,
    type AttestationTokenResponse,
    type StoreProofResponse,
    type TLSNotaryToken,
    type RequestAttestationOptions,
    type StoreProofOptions,
} from "./TLSNotaryService"

// Types
export type {
    TLSNotaryConfig,
    TLSNotaryDiscoveryInfo,
    AttestRequest,
    AttestResult,
    AttestOptions,
    CommitRanges,
    Range,
    PresentationJSON,
    VerificationResult,
    TranscriptInfo,
    StatusCallback,
    ProxyRequestResponse,
    ProxyRequestError,
} from "./types"

// Re-export default
export { default } from "./TLSNotary"

// Helper function exports
export { calculateStorageFee } from "./helpers"

/**
 * Re-export tlsn-js classes and functions for convenience.
 *
 * This allows users to import everything from '@kynesyslabs/demosdk/tlsnotary'
 * without needing to install tlsn-js as a separate dependency.
 *
 * Note: The WASM must still be initialized (call `init()`) before using
 * Prover or Presentation classes.
 */
export {
    // WASM initialization
    default as init,
    // Core classes
    Prover,
    Presentation,
    NotaryServer,
    Transcript,
    // Types re-exported from tlsn-js
    type Commit,
    type Reveal,
    type Method,
    type ProverConfig,
    type LoggingLevel,
    type LoggingConfig,
} from "tlsn-js"

// Re-export types from tlsn-js/build/types for advanced usage
export type {
    PresentationJSON as TlsnPresentationJSON,
} from "tlsn-js/build/types"
