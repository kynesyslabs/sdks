# TLSNotary Complete Implementation Flow

## Overview

This document provides a complete implementation example for integrating TLSNotary attestation in a browser-based dApp.

## Complete React Example

```typescript
// app.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Demos } from '@kynesyslabs/demosdk/websdk';
import { TLSNotaryService } from '@kynesyslabs/demosdk/tlsnotary/service';
import { TLSNotaryClient } from './TLSNotaryClient';

// Global instances
let tlsnClient: TLSNotaryClient | null = null;
let demosInstance: Demos | null = null;
let tlsnService: TLSNotaryService | null = null;

function App() {
  // State
  const [wasmReady, setWasmReady] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [tokenId, setTokenId] = useState('');
  const [wsProxyUrl, setWsProxyUrl] = useState('');
  const [result, setResult] = useState<any>(null);
  
  // Configuration
  const [notaryUrl] = useState('http://localhost:7047');
  const [rpcUrl] = useState('http://localhost:53550');
  const [targetUrl, setTargetUrl] = useState('https://api.example.com/data');

  // Initialize WASM client
  useEffect(() => {
    const init = async () => {
      tlsnClient = new TLSNotaryClient({ notaryUrl, rpcUrl });
      await tlsnClient.initialize();
      setWasmReady(true);
    };
    init();
  }, []);

  // Connect wallet
  // NOTE: For production apps, use demos.connectWalletExtension() instead
  // The mnemonic input is shown here for simplicity in development/testing
  const connectWallet = useCallback(async (mnemonic: string) => {
    demosInstance = new Demos();
    await demosInstance.connect(rpcUrl);
    
    // Option 1: Direct mnemonic (development/testing only)
    await demosInstance.connectWallet(mnemonic);
    
    // Option 2: Wallet Extension (recommended for production)
    // await demosInstance.connectWalletExtension();
    
    tlsnService = new TLSNotaryService(demosInstance);
    setWalletConnected(true);
  }, [rpcUrl]);

  // Full attestation flow
  const performAttestation = useCallback(async () => {
    if (!tlsnService || !tlsnClient) return;

    // Step 1: Request token (burns 1 DEM)
    console.log('Requesting attestation token...');
    const tokenResponse = await tlsnService.requestAttestation({
      targetUrl: targetUrl,
    });
    
    setTokenId(tokenResponse.tokenId);
    setWsProxyUrl(tokenResponse.proxyUrl);
    console.log('Token received:', tokenResponse.tokenId);
    console.log('Proxy URL:', tokenResponse.proxyUrl);

    // Step 2: Perform attestation via WASM
    console.log('Starting TLS attestation...');
    const notarizeConfig = {
      notaryUrl: notaryUrl,
      websocketProxyUrl: tokenResponse.proxyUrl,
      maxSentData: 16384,
      maxRecvData: 4096,
      url: targetUrl,
      method: 'GET' as const,
      headers: { Accept: 'application/json' },
      commit: {
        sent: [{ start: 0, end: 100 }],
        recv: [{ start: 0, end: 200 }],
      },
      serverIdentity: true,
    };

    // Access the worker exposed during initialization
    const presentationJSON = await (window as any).__worker.Prover.notarize(
      notarizeConfig
    );
    console.log('Attestation complete!');

    // Step 3: Verify locally
    const verification = await tlsnClient.verify(presentationJSON);
    console.log('Verification:', verification);

    setResult({ presentation: presentationJSON, verification });
    
    return { presentation: presentationJSON, verification, tokenId: tokenResponse.tokenId };
  }, [targetUrl, notaryUrl]);

  // Store proof on-chain
  const storeProof = useCallback(async (
    tokenId: string,
    presentation: any,
    storageType: 'onchain' | 'ipfs' = 'onchain'
  ) => {
    if (!tlsnService) return;

    const proofString = typeof presentation === 'string'
      ? presentation
      : JSON.stringify(presentation);

    // Calculate fee before storing
    const proofSizeKB = Math.ceil(proofString.length / 1024);
    const estimatedFee = tlsnService.calculateStorageFee(proofSizeKB);
    console.log(`Storing proof (${proofSizeKB} KB), fee: ${estimatedFee} DEM`);

    const storeResult = await tlsnService.storeProof(
      tokenId,
      proofString,
      { storage: storageType }
    );

    console.log('Proof stored!');
    console.log('Transaction hash:', storeResult.txHash);
    console.log('Fee burned:', storeResult.storageFee, 'DEM');

    return storeResult;
  }, []);

  return (
    <div>
      {/* Your UI here */}
    </div>
  );
}
```

## Simplified Flow Functions

### Request Token Only

```typescript
async function requestToken(targetUrl: string): Promise<{
  tokenId: string;
  proxyUrl: string;
}> {
  const response = await tlsnService.requestAttestation({ targetUrl });
  return {
    tokenId: response.tokenId,
    proxyUrl: response.proxyUrl,
  };
}
```

### Attest with Existing Proxy

```typescript
async function attestWithProxy(
  proxyUrl: string,
  targetUrl: string,
  options?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    maxRecvData?: number;
  }
): Promise<any> {
  const config = {
    notaryUrl: notaryUrl,
    websocketProxyUrl: proxyUrl,
    maxSentData: 16384,
    maxRecvData: options?.maxRecvData || 4096,
    url: targetUrl,
    method: options?.method || 'GET',
    headers: { Accept: 'application/json', ...options?.headers },
    body: options?.body,
    commit: {
      sent: [{ start: 0, end: 100 }],
      recv: [{ start: 0, end: 200 }],
    },
    serverIdentity: true,
  };

  return (window as any).__worker.Prover.notarize(config);
}
```

### Full Attestation (Combined)

```typescript
async function fullAttestation(targetUrl: string): Promise<{
  tokenId: string;
  presentation: any;
  verification: any;
}> {
  // Request token
  const { tokenId, proxyUrl } = await requestToken(targetUrl);
  
  // Perform attestation
  const presentation = await attestWithProxy(proxyUrl, targetUrl);
  
  // Verify
  const verification = await tlsnClient.verify(presentation);
  
  return { tokenId, presentation, verification };
}
```

## Commit Ranges

The `commit` field specifies which parts of the request/response to reveal:

```typescript
commit: {
  // Reveal bytes 0-100 of the request
  sent: [{ start: 0, end: 100 }],
  // Reveal bytes 0-200 of the response
  recv: [{ start: 0, end: 200 }],
}
```

Adjust ranges based on what you need to prove. Larger ranges = larger proofs = higher storage costs.

## Error Handling Best Practices

```typescript
async function safeAttestation(targetUrl: string) {
  try {
    // Validate URL
    const url = new URL(targetUrl);
    if (url.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are supported');
    }

    // Check wallet connection
    if (!demosInstance?.walletConnected) {
      throw new Error('Please connect your wallet first');
    }

    // Check WASM ready
    if (!(window as any).__worker) {
      throw new Error('TLSNotary WASM not initialized');
    }

    return await fullAttestation(targetUrl);
  } catch (error: any) {
    console.error('Attestation failed:', error.message);
    throw error;
  }
}
```

## Production Checklist

- [ ] Use `demos.connectWalletExtension()` instead of direct mnemonic
- [ ] Set proper CORS headers for cross-origin isolation
- [ ] Copy tlsn-js WASM files to production build
- [ ] Configure notary and RPC URLs for production environment
- [ ] Handle token expiration and retry logic
- [ ] Implement proper error handling and user feedback
- [ ] Consider proof size when setting commit ranges

## Related Memories

- `tlsnotary_overview`: Architecture and flow overview
- `tlsnotary_sdk_integration`: SDK API reference
- `tlsnotary_browser_setup`: Bundler configuration
