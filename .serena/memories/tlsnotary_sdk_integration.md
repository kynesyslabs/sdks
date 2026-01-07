# TLSNotary SDK Integration

## Installation

```bash
npm install @kynesyslabs/demosdk tlsn-js
# or
bun add @kynesyslabs/demosdk tlsn-js
```

## SDK Imports

```typescript
// Main Demos SDK
import { Demos } from '@kynesyslabs/demosdk/websdk';

// TLSNotary Service (token management, no Web Worker dependencies)
import { TLSNotaryService } from '@kynesyslabs/demosdk/tlsnotary/service';
```

## TLSNotaryService API

### Constructor

```typescript
const demos = new Demos();
await demos.connect('https://node.demos.sh');
await demos.connectWallet(mnemonic);  // or demos.connectWalletExtension()

const tlsnService = new TLSNotaryService(demos);
```

**Requirements:**
- Demos instance must be connected to a node
- Wallet must be connected

### requestAttestation(options)

Request an attestation token (burns 1 DEM).

```typescript
interface RequestAttestationOptions {
  targetUrl: string;  // HTTPS URL to attest
}

interface AttestationTokenResponse {
  proxyUrl: string;      // WebSocket proxy URL for attestation
  tokenId: string;       // Unique token ID
  expiresAt: number;     // Expiration timestamp (ms)
  retriesLeft: number;   // Remaining retry attempts
}

const response = await tlsnService.requestAttestation({
  targetUrl: 'https://api.example.com/data'
});

console.log(response.proxyUrl);  // ws://node:port/proxy/...
console.log(response.tokenId);   // tlsn_abc123...
```

### storeProof(tokenId, proof, options)

Store attestation proof on-chain or IPFS (burns 1 + size DEM).

```typescript
interface StoreProofOptions {
  storage: 'onchain' | 'ipfs';
}

interface StoreProofResponse {
  txHash: string;           // Transaction hash
  storageFee: number;       // Total fee burned
  broadcastStatus: number;  // HTTP status (200 = success)
  broadcastMessage?: string; // Node response message
}

const result = await tlsnService.storeProof(
  tokenId,
  JSON.stringify(presentation),
  { storage: 'onchain' }
);
```

### calculateStorageFee(proofSizeKB)

Calculate storage fee before storing.

```typescript
const proofSizeKB = Math.ceil(proofString.length / 1024);
const fee = tlsnService.calculateStorageFee(proofSizeKB);
// Returns: 1 (base) + proofSizeKB
```

### getToken(tokenId) / getTokenByTxHash(txHash)

Retrieve token information.

```typescript
interface TLSNotaryToken {
  tokenId: string;
  owner: string;
  domain: string;
  status: 'pending' | 'used' | 'expired' | 'stored';
  createdAt: number;
  expiresAt: number;
  retriesLeft: number;
  proofHash?: string;      // If stored
  storageType?: 'onchain' | 'ipfs';
}

const token = await tlsnService.getToken(tokenId);
// or
const token = await tlsnService.getTokenByTxHash(txHash);
```

## GCR (Global Chain Registry) Edits

The SDK's `GCRGeneration` handles native transaction processing:

### tlsn_request

```typescript
// SDK generates balance edit to burn 1 DEM
case "tlsn_request": {
  const TLSN_REQUEST_FEE = 1;
  edits.push({
    type: "balance",
    operation: "remove",
    account: tx.content.from_ed25519_address,
    amount: TLSN_REQUEST_FEE,
    // ...
  });
}
```

### tlsn_store

```typescript
// SDK generates balance edit based on proof size
case "tlsn_store": {
  const [, proof] = nativePayload.args;
  const proofSizeKB = Math.ceil(proof.length / 1024);
  const storageFee = 1 + proofSizeKB;
  edits.push({
    type: "balance",
    operation: "remove",
    account: tx.content.from_ed25519_address,
    amount: storageFee,
    // ...
  });
}
```

## Error Handling

```typescript
try {
  const response = await tlsnService.requestAttestation({ targetUrl });
} catch (error) {
  // Common errors:
  // - "Demos instance must be connected to a node"
  // - "Wallet must be connected to use TLSNotaryService"
  // - "Only HTTPS URLs are supported for TLS attestation"
  // - "Token not created after X seconds..."
  // - "Failed to get proxy URL from node"
}
```

## Related Memories

- `tlsnotary_overview`: Architecture and flow overview
- `tlsnotary_browser_setup`: Browser/bundler configuration
- `tlsnotary_complete_flow`: Full implementation example
