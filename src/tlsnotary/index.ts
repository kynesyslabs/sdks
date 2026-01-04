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
