/**
 * TLSNotary SDK Module
 *
 * Browser-based HTTPS attestation using MPC-TLS.
 *
 * @packageDocumentation
 * @module tlsnotary
 *
 * @example
 * ```typescript
 * import { TLSNotary } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * const tlsn = new TLSNotary({
 *   notaryUrl: 'wss://node.demos.sh:7047',
 *   websocketProxyUrl: 'wss://node.demos.sh:55688',
 * });
 *
 * await tlsn.initialize();
 *
 * const result = await tlsn.attest({
 *   url: 'https://api.github.com/users/octocat',
 * });
 *
 * console.log('Verified:', result.verification.serverName);
 * ```
 */

export { TLSNotary } from "./TLSNotary"
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
} from "./types"

// Re-export default
export { default } from "./TLSNotary"
