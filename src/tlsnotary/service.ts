/**
 * TLSNotary Service Module (Browser-Safe)
 *
 * This module exports only the TLSNotaryService and helper functions,
 * without the Web Worker-dependent TLSNotary class.
 *
 * Use this import path when you only need token management and don't
 * need the browser-based attestation functionality:
 *
 * @example
 * ```typescript
 * // Import only the service (no Web Worker dependencies)
 * import { TLSNotaryService, calculateStorageFee } from '@kynesyslabs/demosdk/tlsnotary/service';
 *
 * const demos = new Demos();
 * await demos.connect('https://node.demos.sh');
 * await demos.connectWallet(mnemonic);
 *
 * const service = new TLSNotaryService(demos);
 * const { proxyUrl, tokenId } = await service.requestAttestation({
 *   targetUrl: 'https://api.github.com/users/octocat'
 * });
 * ```
 *
 * @packageDocumentation
 * @module tlsnotary/service
 */

// TLSNotary Service for token management and proof storage (no Web Worker deps)
export {
    TLSNotaryService,
    type AttestationTokenResponse,
    type StoreProofResponse,
    type TLSNotaryToken,
    type RequestAttestationOptions,
    type StoreProofOptions,
} from "./TLSNotaryService"

// Helper function exports
export { calculateStorageFee } from "./helpers"
