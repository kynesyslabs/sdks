# Storage Transactions

Storage transactions allow you to store binary data directly on the DEMOS blockchain. This data is stored in JSONB format in the node repository, making it queryable and efficient for retrieval.

## Overview

Storage transactions are designed to handle arbitrary binary data while maintaining compatibility with the blockchain's JSON-based storage system. The binary data is automatically base64-encoded for storage and can be retrieved later. Data is always stored in the sender's account.

## Key Features

- **Binary Data Storage**: Store any type of binary data (files, images, documents, etc.)
- **JSONB Compatibility**: Data is automatically encoded for efficient database storage
- **Zero Token Transfer**: Storage transactions don't transfer native tokens (amount is always 0)
- **Sender-Only Storage**: Data is automatically stored in the sender's account
- **Standard Gas Costs**: Normal transaction gas fees apply

## Usage

### Basic Storage

```typescript
import { Demos } from '@demos/sdk'

const demos = new Demos()

// Connect to a node and wallet
await demos.connect('https://node.demos.network')
await demos.connectWallet('your-mnemonic-here')

// Store binary data in your account
const fileData = new Uint8Array([1, 2, 3, 4, 5]) // Your binary data

const storageTx = await demos.store(fileData)
```

### Transaction Structure

Storage transactions follow the standard DEMOS transaction format:

```typescript
{
  content: {
    type: 'storage',
    from: '0xsender...',
    to: '0xsender...', // Always same as from - data stored in sender's account
    amount: 0, // Always 0 for storage transactions
    data: [
      'storage',
      {
        bytes: 'base64EncodedData...', // Your binary data as base64
        metadata?: { /* optional metadata */ }
      }
    ],
    // ... other transaction fields
  },
  // ... signature and other transaction properties
}
```

## API Reference

### `demos.store(bytes)`

Creates and signs a storage transaction. Data is stored in the sender's account.

**Parameters:**
- `bytes` (Uint8Array): The binary data to store

**Returns:** Promise&lt;Transaction&gt; - The signed storage transaction

**Example:**
```typescript
const imageBytes = new Uint8Array(await fetch('/image.png').then(r => r.arrayBuffer()))
const tx = await demos.store(imageBytes)
```

### `DemosTransactions.store(bytes, demos)`

Lower-level method for creating storage transactions.

**Parameters:**
- `bytes` (Uint8Array): The binary data
- `demos` (Demos): The demos instance

**Returns:** Promise&lt;Transaction&gt; - The signed storage transaction

## Data Format

### Storage Payload

```typescript
interface StoragePayload {
  bytes: string          // Base64-encoded binary data
  metadata?: Record<string, any>  // Optional metadata
}
```

### Base64 Encoding

Binary data is automatically converted to base64 format for JSON compatibility:

```typescript
// Input: Uint8Array([72, 101, 108, 108, 111])
// Stored as: "SGVsbG8="
```

## Use Cases

- **Document Storage**: Store PDFs, Word documents, or other files
- **Image Storage**: Store images, avatars, or media files
- **Data Archival**: Store any binary data for immutable archival
- **Metadata Storage**: Store structured data with optional metadata

## Best Practices

1. **Size Limitations**: Keep in mind the 64KB maximum total storage size per address on the blockchain
2. **Data Validation**: Validate your binary data before storing
3. **Account Organization**: Organize data within your account using metadata
4. **Metadata Usage**: Leverage the optional metadata field for additional context and organization

## Transaction Confirmation

Like all DEMOS transactions, storage transactions require confirmation and broadcasting:

```typescript
const storageTx = await demos.store(fileData)
const validityData = await demos.confirm(storageTx)
const result = await demos.broadcast(validityData)
```

## Error Handling

Common errors and solutions:

- **Wallet not connected**: Ensure `demos.connectWallet()` is called first
- **Storage limit exceeded**: Each address has a 64KB total storage limit on the blockchain
- **Network issues**: Check your connection to the DEMOS node

```typescript
try {
  const tx = await demos.store(data)
  // Handle success
} catch (error) {
  if (error.message.includes('Wallet not connected')) {
    // Handle wallet connection error
  }
  // Handle other errors
}
```