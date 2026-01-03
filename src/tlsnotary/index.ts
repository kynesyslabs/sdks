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
 * // Option 1: Via Demos instance (recommended - auto-configures dynamic proxies)
 * const demos = new Demos();
 * await demos.connect('https://node.demos.sh');
 * const tlsn = await demos.tlsnotary();
 *
 * // Option 2: Manual configuration with dynamic proxies
 * const tlsn = new TLSNotary({
 *   notaryUrl: 'wss://node.demos.sh:7047',
 *   rpcUrl: 'https://node.demos.sh', // For dynamic proxy allocation
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
    ProxyRequestResponse,
    ProxyRequestError,
} from "./types"

// Re-export default
export { default } from "./TLSNotary"
