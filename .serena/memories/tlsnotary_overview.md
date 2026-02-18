# TLSNotary Integration Overview

## What is TLSNotary?

TLSNotary is an MPC-TLS (Multi-Party Computation TLS) protocol that enables cryptographic attestation of HTTPS requests. It allows users to prove they received specific data from a web server without revealing their credentials or the full response.

## Demos Network TLSNotary Flow

The Demos Network provides a token-based TLSNotary service with the following characteristics:

### Key Components

1. **Notary Server**: Performs the MPC-TLS protocol (typically runs on port 7047)
2. **WebSocket Proxy**: Routes TLS traffic through MPC (dynamically allocated)
3. **Demos Node**: Manages tokens, proxies, and on-chain storage (RPC port 53550)
4. **SDK**: `@kynesyslabs/demosdk` provides `TLSNotaryService` for token management
5. **WASM Library**: `tlsn-js` handles browser-side MPC-TLS operations

### Token-Based Flow (Recommended)

The token flow requires wallet connection and burns DEM tokens:

```
1. Request Token (burns 1 DEM)
   └── Creates attestation token with unique ID
   └── Returns WebSocket proxy URL

2. Perform Attestation
   └── Use proxy URL with tlsn-js WASM
   └── MPC-TLS protocol with notary
   └── Returns cryptographic presentation

3. Store Proof (optional, burns 1 + size DEM)
   └── Store on-chain or IPFS
   └── Proof linked to token ID
```

### Fee Structure

| Operation | Cost |
|-----------|------|
| Request attestation token | 1 DEM |
| Store proof (base fee) | 1 DEM |
| Store proof (per KB) | 1 DEM |

Example: A 5KB proof costs 1 (request) + 1 (base) + 5 (size) = 7 DEM total.

### Native Transaction Types

TLSNotary uses native transactions with these operations:

- `tlsn_request`: Request attestation token
  - Args: `[targetUrl]`
  - Burns: 1 DEM

- `tlsn_store`: Store attestation proof
  - Args: `[tokenId, proof, storageType]`
  - Burns: 1 + ceil(proofSize/1024) DEM

### Token Lifecycle

```
pending → used → stored
    ↓
  expired (if not used within timeout)
```

Tokens include:
- `tokenId`: Unique identifier (e.g., `tlsn_xxxx...`)
- `proxyUrl`: WebSocket proxy for attestation
- `expiresAt`: Expiration timestamp
- `retriesLeft`: Remaining retry attempts (default: 3)

## Wallet Connection Options

The SDK supports multiple wallet connection methods:

1. **Direct Mnemonic** (for testing/development):
   ```typescript
   await demos.connectWallet(mnemonic);
   ```

2. **Demos Wallet Extension** (recommended for production):
   ```typescript
   await demos.connectWalletExtension();
   ```

The Wallet Extension provides better security as the mnemonic never leaves the extension.

## Browser Requirements

TLSNotary WASM requires specific browser features:

- **SharedArrayBuffer**: Required for WASM threading
- **Cross-Origin Isolation**: Required HTTP headers:
  ```
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
  ```

## Related Memories

- `tlsnotary_sdk_integration`: SDK usage and TLSNotaryService API
- `tlsnotary_browser_setup`: Webpack/Vite configuration for browser
- `tlsnotary_complete_flow`: Full implementation example
