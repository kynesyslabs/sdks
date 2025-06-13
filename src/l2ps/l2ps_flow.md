# L2PS Transaction Flow Documentation

## Overview

L2PS (Layer 2 Parallel Subnets) provides encrypted transaction processing capabilities as subnets of the main DEMOS network. This document outlines the complete transaction flow for sending encrypted transactions through L2PS networks.

## Transaction Flow Comparison

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

### Sender Side (Client)

1. **Create** → Original transaction with all required fields
2. **Sign** → Apply user signature to original transaction  
3. **Encrypt** → Use L2PS to encrypt the signed transaction
4. **Sign** → Apply user signature to encrypted wrapper
5. **Send** → Submit to DEMOS network

### Network Side (Nodes)

1. **Receive** → Encrypted transaction appears as normal "l2psEncryptedTx"
2. **Validate** → Verify wrapper signature (standard validation)
3. **Route** → Forward to appropriate L2PS nodes
4. **Process** → L2PS nodes decrypt and process original transaction

### L2PS Node Side

1. **Decrypt** → Extract original transaction from encrypted payload
2. **Verify** → Validate original transaction signature
3. **Process** → Execute transaction within L2PS network
4. **Consensus** → Reach agreement on transaction validity

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

## Node Behavior and Privacy Model

### Non-L2PS Nodes Receiving L2PS Transactions

When a regular DEMOS node receives an L2PS encrypted transaction (by mistake, routing, or broadcast), it encounters a transaction that looks like this:

```typescript
{
    content: {
        type: "l2psEncryptedTx",
        from: "user_public_key",
        to: "recipient_public_key", 
        amount: 0,
        data: ["l2psEncryptedTx", {
            l2ps_uid: "l2ps-network-xyz",
            encrypted_data: "base64-encrypted-data-here", // ENCRYPTED
            tag: "base64-auth-tag-here",                   // AUTH TAG  
            original_hash: "sha256-hash"
        }]
    },
    signature: "valid_wrapper_signature",
    hash: "transaction_hash"
}
```

### What Non-L2PS Nodes CANNOT Do

- ❌ **Decrypt** the `encrypted_data` (lacks the L2PS private key)
- ❌ **Read** the original transaction content
- ❌ **Process** the actual transaction logic
- ❌ **Validate** the business logic within the encrypted payload

### What Non-L2PS Nodes CAN Do

- ✅ **Validate** the wrapper transaction structure
- ✅ **Verify** the wrapper signature
- ✅ **Route** it to appropriate L2PS nodes (if routing table exists)
- ✅ **Reject** gracefully with appropriate error message

### Privacy Guarantees

#### Confidentiality

- Transaction details (amounts, recipients, data) remain completely hidden
- Only L2PS UID is visible (identifies which L2PS network, but not the content)
- Non-L2PS nodes act as blind routers for encrypted packages

#### Authenticity

- Non-L2PS nodes can verify the transaction came from a legitimate sender
- Wrapper signature ensures the encrypted payload hasn't been tampered with
- Cannot verify internal transaction validity without decryption

#### Integrity

- AES-GCM authentication tag prevents tampering
- Any modification to encrypted data will be detected during decryption
- Hash verification ensures original transaction integrity after decryption

### Network Routing Behavior

```
Regular Node receives L2PS tx → 
"I can see this is for l2ps-network-xyz, but I can't decrypt it" →
Route to known L2PS-xyz participants OR reject gracefully
```

### Error Handling for Non-L2PS Nodes

```typescript
// Example error response
{
    success: false,
    error: "Transaction type l2psEncryptedTx for unknown L2PS network: l2ps-network-xyz",
    code: "L2PS_NETWORK_UNAVAILABLE"
}
```

### Security Model Summary

- **L2PS Networks**: Cryptographic access-controlled subnets with shared secrets
- **Main DEMOS Network**: Public routing infrastructure that carries encrypted packages
- **Privacy Layer**: Selective transparency where only authorized participants can decrypt content
- **Routing Security**: Encrypted transactions can safely traverse untrusted network paths

## Error Handling

### Common Error Scenarios

- **Invalid L2PS UID**: Transaction encrypted for unknown L2PS network
- **Decryption Failure**: Invalid keys or corrupted encrypted data
- **Hash Mismatch**: Original transaction hash doesn't match after decryption
- **Signature Verification**: Either original or wrapper signature validation fails

### Error Recovery

- **Graceful Degradation**: Failed L2PS transactions don't affect main network
- **Detailed Logging**: Comprehensive error messages for debugging
- **Fallback Mechanisms**: Alternative processing paths for edge cases

## Implementation Notes

### Performance Considerations

- **Encryption Overhead**: AES-GCM encryption adds minimal computational cost
- **Size Increase**: Base64 encoding increases payload size by ~33%
- **Memory Usage**: Temporary storage of both original and encrypted transactions

### Development Guidelines

- **Key Management**: Secure storage and rotation of L2PS encryption keys
- **Testing**: Comprehensive test coverage for encryption/decryption flows
- **Monitoring**: Track L2PS transaction success/failure rates
- **Documentation**: Maintain clear API documentation for L2PS integration

## Future Enhancements

### Possible Features

- **Key Rotation**: Dynamic L2PS encryption key updates
- **Multi-L2PS**: Transactions spanning multiple L2PS networks
- **Batch Processing**: Efficient handling of multiple encrypted transactions
- **Advanced Privacy**: Additional privacy-preserving techniques
