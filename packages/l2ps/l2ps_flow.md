# L2PS Client-Side Transaction Flow

## Overview

This document explains how to create, encrypt, and send L2PS (Layer 2 Privacy Subnets) transactions from the client side using the DEMOS SDK. For node-side processing, see `node/src/libs/l2ps/l2ps_node_flow.md`.

## Transaction Flow Comparison

### Client-Side L2PS Transaction Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT-SIDE L2PS FLOW                           │
│                    (SDK Implementation)                             │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │   Client App    │
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 1. Create       │ ──► ✅ IMPLEMENTED: Standard transaction creation
    │ Original TX     │     using DEMOS SDK
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 2. Sign         │ ──► ✅ IMPLEMENTED: Ed25519 signature
    │ Original TX     │     on transaction content
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 3. Load L2PS    │ ──► ✅ IMPLEMENTED: L2PS.create(privateKey, iv)
    │ Instance        │     from network configuration
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 4. Encrypt TX   │ ──► ✅ IMPLEMENTED: l2ps.encryptTx(originalTx)
    │ with L2PS       │     AES-GCM encryption + wrapper creation
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 5. Sign         │ ──► ✅ IMPLEMENTED: Sign encrypted wrapper
    │ Encrypted TX    │     with user private key
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 6. Send to      │ ──► ✅ IMPLEMENTED: Standard RPC call
    │ Network         │     to DEMOS node
    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │ 7. Network      │ ──► 🔄 TODO: Enhanced error handling
    │ Response        │     for L2PS-specific failures
    └─────────────────┘
```

### Normal DEMOS Transaction Flow

```typescript
// 1. Create transaction content
const txContent = {
    type: "native",
    from: userPublicKey,
    to: recipientPublicKey, 
    amount: 100,
    data: ["native", nativePayload],
    gcr_edits: [],
    nonce: userNonce,
    timestamp: Date.now(),
    transaction_fee: txFee
}

// 2. Create transaction object
const transaction = {
    content: txContent,
    signature: null,
    hash: Hashing.sha256(JSON.stringify(txContent)),
    status: "pending",
    blockNumber: null
}

// 3. Sign the transaction
transaction.signature = signTransaction(transaction, userPrivateKey)

// 4. Send to node/mempool
sendTransaction(transaction)
```

### L2PS Encrypted Transaction Flow

```typescript
// 1. Create the ORIGINAL transaction (same as normal flow)
const originalTx = {
    content: {
        type: "native", // or any other transaction type
        from: userPublicKey,
        to: recipientPublicKey,
        amount: 100,
        data: ["native", nativePayload],
        gcr_edits: [],
        nonce: userNonce,
        timestamp: Date.now(),
        transaction_fee: txFee
    },
    signature: userSignature, // ⚠️ Sign the ORIGINAL transaction FIRST
    hash: Hashing.sha256(JSON.stringify(originalTxContent)),
    status: "pending",
    blockNumber: null
}

// 2. Encrypt the ENTIRE signed transaction using L2PS
const l2ps = await L2PS.create() // or load existing L2PS instance
const encryptedTx = await l2ps.encryptTx(originalTx, userPublicKey)

// This creates a NEW transaction with:
// - type: "l2psEncryptedTx" 
// - data: ["l2psEncryptedTx", L2PSEncryptedPayload]
// - signature: null (needs new signature for the wrapper)

// 3. Sign the ENCRYPTED transaction wrapper
encryptedTx.signature = signTransaction(encryptedTx, userPrivateKey)

// 4. Send the encrypted transaction to node/mempool
sendTransaction(encryptedTx) // Appears as normal transaction to the network
```

## Key Concepts

### Transaction Structure Transformation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Original Transaction                              │
├─────────────────────────────────────────────────────────────────────┤
│ {                                                                   │
│   content: {                                                        │
│     type: "native",                                                │
│     from: "user_pubkey",                                           │
│     to: "recipient_pubkey",                                        │
│     amount: 100,                                                   │
│     data: ["native", payload]                                     │
│   },                                                               │
│   signature: "user_signature_on_original",    ◄─── First Signature │
│   hash: "original_tx_hash"                                         │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ L2PS Encryption
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Encrypted Transaction Wrapper                     │
├─────────────────────────────────────────────────────────────────────┤
│ {                                                                   │
│   content: {                                                        │
│     type: "l2psEncryptedTx",           ◄─── New Type              │
│     from: "user_pubkey",                                           │
│     to: "recipient_pubkey",                                        │
│     amount: 0,                         ◄─── Amount Hidden         │
│     data: ["l2psEncryptedTx", {                                   │
│       l2ps_uid: "network-id",                                     │
│       encrypted_data: "base64_encrypted_original_tx", ◄─── HIDDEN │
│       tag: "aes_gcm_auth_tag",                                    │
│       original_hash: "original_tx_hash"                           │
│     }]                                                            │
│   },                                                              │
│   signature: "user_signature_on_wrapper",   ◄─── Second Signature │
│   hash: "wrapper_tx_hash"                                         │
│ }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Double Signing Process

1. **First Signature**: Applied to the original transaction before encryption
   - Ensures integrity of the actual transaction content
   - Verified by L2PS nodes after decryption

2. **Second Signature**: Applied to the encrypted transaction wrapper
   - Ensures authenticity of the encrypted payload
   - Verified by all network nodes (standard transaction validation)

### Transaction Structure

#### Original Transaction

```typescript
{
    content: {
        type: "native" | "web2Request" | "crosschainOperation" | ...,
        // ... actual transaction data
    },
    signature: ISignature, // User's signature on original content
    hash: string,
    // ...
}
```

#### Encrypted Transaction Wrapper

```typescript
{
    content: {
        type: "l2psEncryptedTx",
        from: userPublicKey,
        to: recipientPublicKey,
        amount: 0,
        data: ["l2psEncryptedTx", {
            l2ps_uid: "l2ps-network-id",
            encrypted_data: "base64-encrypted-original-tx",
            tag: "base64-aes-gcm-auth-tag",
            original_hash: "sha256-hash-of-original-tx"
        }],
        // ...
    },
    signature: ISignature, // User's signature on encrypted wrapper
    hash: string,
    // ...
}
```

## Processing Flow

### Network Privacy Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L2PS Privacy Layers                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Regular Node   │    │  Regular Node   │    │   L2PS Node     │
│                 │    │                 │    │                 │
│   👁️ Can See:    │    │   👁️ Can See:    │    │   👁️ Can See:    │
│   • Wrapper TX  │    │   • Wrapper TX  │    │   • Wrapper TX  │
│   • L2PS UID    │    │   • L2PS UID    │    │   • L2PS UID    │
│   • Signatures  │    │   • Signatures  │    │   • Signatures  │
│                 │    │                 │    │   • Original TX │
│   🚫 Cannot:     │    │   🚫 Cannot:     │    │   • Real Amount │
│   • Decrypt     │    │   • Decrypt     │    │   • Real Data   │
│   • See Amount  │    │   • See Amount  │    │                 │
│   • See Data    │    │   • See Data    │    │   🔐 Can Do:     │
│                 │    │                 │    │   • Decrypt     │
│   ✅ Can Do:     │    │   ✅ Can Do:     │    │   • Process TX  │
│   • Route TX    │    │   • Route TX    │    │   • Execute     │
│   • Reject TX   │    │   • Reject TX   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Encrypted Transaction Flow                              │
│                                                                     │
│  [Encrypted TX] ──► Route ──► Route ──► L2PS Node                  │
│                                              │                      │
│                                              ▼                      │
│                                        [Decrypted TX]               │
│                                              │                      │
│                                              ▼                      │
│                                        [Process & Execute]          │
└─────────────────────────────────────────────────────────────────────┘
```

### Client-Side Processing Steps

1. **Create** → Original transaction with all required fields
2. **Sign** → Apply user signature to original transaction  
3. **Encrypt** → Use L2PS to encrypt the signed transaction
4. **Sign** → Apply user signature to encrypted wrapper
5. **Send** → Submit to DEMOS network
6. **Handle Response** → Process network response and errors

> **Note**: For network-side processing (steps 7-10), see the node-side documentation: `node/src/libs/l2ps/l2ps_node_flow.md`

## Security Features

### Confidentiality

- **AES-GCM Encryption**: Original transaction content is encrypted using AES-256-GCM
- **L2PS-Specific Keys**: Each L2PS network has unique encryption keys
- **Base64 Encoding**: Encrypted data is safely serialized for JSON transport

### Integrity

- **Authentication Tags**: AES-GCM provides built-in authentication
- **Hash Verification**: Original transaction hash is preserved and verified
- **Double Signatures**: Both original and wrapper transactions are signed

### Network Compatibility

- **Standard Format**: Encrypted transactions follow normal Transaction interface
- **Type System**: Uses existing transaction type system with "l2psEncryptedTx"
- **Pipeline Integration**: Flows through standard transaction processing pipeline

### Cryptographic Access Control

- **Selective Decryption**: Only nodes with L2PS private keys can decrypt transaction content
- **Privacy Guarantees**: Non-L2PS nodes cannot access encrypted transaction details
- **Secure Routing**: Encrypted transactions can be safely routed through non-participating nodes

## Client-Side Privacy and Security

### What Clients Need to Know

When you send an L2PS transaction, here's what happens from a privacy perspective:

```typescript
// What you send (visible to all nodes):
{
    content: {
        type: "l2psEncryptedTx",
        from: "your_public_key",
        to: "recipient_public_key", 
        amount: 0,                              // ✅ Hidden: Real amount encrypted
        data: ["l2psEncryptedTx", {
            l2ps_uid: "l2ps-network-xyz",       // ✅ Visible: Network identifier
            encrypted_data: "base64-encrypted", // ❌ Hidden: Actual transaction
            tag: "base64-auth-tag",             // ✅ Visible: Integrity tag
            original_hash: "sha256-hash"        // ✅ Visible: Original TX hash
        }]
    },
    signature: "your_wrapper_signature",       // ✅ Visible: Wrapper signature
    hash: "wrapper_transaction_hash"           // ✅ Visible: Wrapper hash
}
```

### Privacy Guarantees for Clients

#### What's Hidden from Network
- ❌ **Real transaction amount** (wrapper shows 0)
- ❌ **Transaction data/payload** (encrypted in `encrypted_data`)
- ❌ **Original transaction type** (could be native, web2Request, etc.)
- ❌ **Business logic details** (completely encrypted)

#### What's Visible to Network
- ✅ **L2PS network identifier** (which privacy subnet you're using)
- ✅ **Wrapper transaction structure** (standard DEMOS transaction format)
- ✅ **Authentication tags** (for integrity verification)
- ✅ **Routing information** (so nodes know where to send it)

### Client Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT SECURITY LAYERS                           │
└─────────────────────────────────────────────────────────────────────┘

Your Original Transaction
         │
         ▼ (First Signature)
┌─────────────────┐
│ Sign Original   │ ──► ✅ IMPLEMENTED: Proves transaction authenticity
│ TX Content      │     to L2PS nodes after decryption
└─────────────────┘
         │
         ▼ (AES-GCM Encryption)
┌─────────────────┐
│ L2PS Encrypt    │ ──► ✅ IMPLEMENTED: Hides content from non-participants
│ with Network    │     Only L2PS nodes can decrypt
│ Private Key     │
└─────────────────┘
         │
         ▼ (Second Signature)
┌─────────────────┐
│ Sign Encrypted  │ ──► ✅ IMPLEMENTED: Proves wrapper authenticity
│ Wrapper         │     to all network nodes
└─────────────────┘
         │
         ▼
    Network Routing ──► 🔄 REVIEW: Node-side implementation
                        (See node flow documentation)
```

## Client-Side Error Handling

### Common Client Errors and Solutions

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE ERROR SCENARIOS                      │
└─────────────────────────────────────────────────────────────────────┘

                      Create L2PS Transaction
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Load L2PS Instance  │
                    └─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              ✅ L2PS Loaded       ❌ L2PS Load Failed
                    │                     │
                    ▼                     ▼
         ┌─────────────────────┐  ┌─────────────────────┐
         │ Encrypt Transaction │  │ 🔄 TODO: Better     │
         └─────────────────────┘  │ Error Messages      │
                    │             │ "Invalid L2PS Config"│
         ┌──────────┴──────────┐  └─────────────────────┘
         ▼                     ▼
  ✅ Encrypt OK        ❌ Encrypt Failed
         │                     │
         ▼                     ▼
┌─────────────────────┐ ┌─────────────────────┐
│ Send to Network     │ │ 🔄 TODO: Retry      │
└─────────────────────┘ │ Logic for Failed    │
         │               │ Encryption          │
┌────────┴────────┐     └─────────────────────┘
▼                 ▼
✅ TX Accepted   ❌ Network Error
│                 │
▼                 ▼
┌─────────────┐   ┌─────────────────────┐
│ Success     │   │ 🔄 TODO: Enhanced   │
│ Response    │   │ Network Error       │
└─────────────┘   │ Handling            │
                  └─────────────────────┘
```

### Error Types and Handling

#### 🔄 TODO: Configuration Errors
- **Invalid L2PS Keys**: Wrong private key or IV format
- **Missing Network Config**: L2PS network not found
- **Key Mismatch**: Private key doesn't match network

#### ✅ IMPLEMENTED: Encryption Errors  
- **Transaction Signing Failed**: Invalid private key for signing
- **Encryption Failed**: AES-GCM encryption error
- **Wrapper Creation Failed**: Invalid transaction structure

#### 🔄 TODO: Network Errors
- **L2PS Network Unavailable**: No participating nodes online
- **Transaction Rejected**: Node-side validation failures
- **Timeout Errors**: Network request timeouts

### Error Recovery Strategies

#### 🔄 TODO: Client-Side Retry Logic
```typescript
// TODO: Implement exponential backoff for network errors
async function sendL2PSTransactionWithRetry(tx: Transaction, maxRetries: number) {
    // Implementation needed
}
```

#### 🔄 TODO: Fallback Mechanisms
```typescript
// TODO: Option to send as regular transaction if L2PS fails
async function sendWithL2PSFallback(tx: Transaction, useL2PS: boolean) {
    // Implementation needed
}
```

## SDK Implementation Status

### ✅ Currently Implemented (Client SDK)

1. **L2PS Class**: Complete AES-GCM encryption/decryption
2. **Transaction Encryption**: `l2ps.encryptTx()` method
3. **Key Management**: L2PS instance creation with private key/IV
4. **Wrapper Creation**: Proper l2psEncryptedTx transaction format
5. **Double Signing**: Both original and wrapper transaction signing

### 🔄 TODO: Client SDK Enhancements

1. **Error Handling**: Better error messages and recovery
2. **Configuration Validation**: Validate L2PS network configs
3. **Retry Logic**: Automatic retry for failed network requests
4. **Batch Operations**: Encrypt multiple transactions efficiently
5. **Key Rotation**: Support for dynamic key updates

### 🔍 REVIEW: Integration Points

1. **Network Detection**: Auto-detect available L2PS networks
2. **Fallback Mechanisms**: Regular transaction if L2PS unavailable
3. **Monitoring**: Track L2PS transaction success rates
4. **Performance**: Optimize encryption for mobile devices

## Usage Examples

### 🔄 TODO: Complete SDK Examples

```typescript
// TODO: Add comprehensive usage examples
import { L2PS } from '@demosdk/demosdk/l2ps'

// Example 1: Basic L2PS transaction
async function sendL2PSTransaction() {
    // Implementation example needed
}

// Example 2: Error handling
async function sendWithErrorHandling() {
    // Implementation example needed  
}

// Example 3: Batch processing
async function sendMultipleL2PSTransactions() {
    // Implementation example needed
}
```

### Client Integration Checklist

- [ ] 🔄 TODO: Validate L2PS network availability
- [ ] ✅ IMPLEMENTED: Load L2PS instance with proper keys
- [ ] ✅ IMPLEMENTED: Create and sign original transaction
- [ ] ✅ IMPLEMENTED: Encrypt transaction with L2PS
- [ ] ✅ IMPLEMENTED: Sign encrypted wrapper
- [ ] ✅ IMPLEMENTED: Send to DEMOS network
- [ ] 🔄 TODO: Handle network responses and errors
- [ ] 🔄 TODO: Implement retry logic for failures
- [ ] 🔄 TODO: Add transaction status monitoring

---

> **For Node-Side Processing**: See `node/src/libs/l2ps/l2ps_node_flow.md`  
> **For Complete System Flow**: See `node/src/libs/l2ps/l2ps_complete_flow.md`
