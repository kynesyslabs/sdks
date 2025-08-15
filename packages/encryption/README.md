# UnifiedCrypto

A unified cryptographic interface that provides a consistent API for multiple encryption and signing algorithms, including both classical and post-quantum cryptography.

## Overview

UnifiedCrypto is a multiton class that provides a unified interface for different cryptographic algorithms:

- **Encryption/Decryption**: ML-KEM-AES (post-quantum); RSA is deactivated due to performances issue
- **Signing/Verification**: ML-DSA, Falcon (post-quantum), and Ed25519 (classical)

The class manages key generation, encryption, decryption, signing, and verification operations through a consistent API, abstracting away the differences between the underlying cryptographic libraries.

## Features

- **Multiton Pattern**: Supports multiple instances with separate state, plus a default instance
- **Unified Interface**: Consistent API for different cryptographic algorithms
- **Key Management**: Automatic key generation and derivation from a master seed
- **Type Safety**: Strong TypeScript typing with discriminated unions for different algorithm types
- **Enhanced Proxy**: Convenient access to both instance and static methods through a single proxy

## Usage

### Basic Usage

```typescript
import { unifiedCrypto } from './unifiedCrypto';

// Generate an identity for a specific algorithm
await unifiedCrypto.generateIdentity('ed25519');

// Sign a message
const message = new TextEncoder().encode('Hello, world!');
const signedObject = await unifiedCrypto.sign('ed25519', message);

// Verify a signature
const isValid = await unifiedCrypto.verify(signedObject);

// Encrypt a message
const encryptedObject = await unifiedCrypto.encrypt('rsa', message, recipientPublicKey);

// Decrypt a message
const decryptedData = await unifiedCrypto.decrypt(encryptedObject);
```

### Using a Master Seed

```typescript
import { unifiedCrypto } from './unifiedCrypto';
import { randomBytes } from '@noble/hashes/utils';

// Generate a random master seed
const masterSeed = randomBytes(128);

// Initialize with a master seed
const crypto = unifiedCrypto; // The proxy automatically calls getInstance with the master seed

// Generate identities for different algorithms using the same master seed
await crypto.generateIdentity('ed25519');
await crypto.generateIdentity('ml-kem-aes');
```

### Using Multiple Instances

```typescript
import { unifiedCrypto, getUnifiedCryptoInstance } from './unifiedCrypto';
import { randomBytes } from '@noble/hashes/utils';

// Create a named instance with a specific seed
const masterSeed1 = randomBytes(128);
const instance1 = getUnifiedCryptoInstance('user1', masterSeed1);
await instance1.generateIdentity('ed25519');

// Create another instance with a different seed
const masterSeed2 = randomBytes(128);
const instance2 = getUnifiedCryptoInstance('user2', masterSeed2);
await instance2.generateIdentity('rsa');

// Each instance maintains its own state
const identity1 = await instance1.getIdentity('ed25519');
const identity2 = await instance2.getIdentity('rsa');

// The default instance is still available
await unifiedCrypto.generateIdentity('ml-kem-aes');

// List all instances
const instanceIds = unifiedCrypto.getInstanceIds();
console.log(instanceIds); // ['default', 'user1', 'user2']

// Remove an instance when no longer needed
unifiedCrypto.removeInstance('user1');
```

## API Reference

### Main Methods

#### `generateIdentity(algorithm, masterSeed?)`

Generates a cryptographic identity for the specified algorithm.

- **Parameters**:
  - `algorithm`: "ed25519" | "falcon" | "ml-dsa" | "ml-kem-aes" | "rsa"
  - `masterSeed?`: Optional Uint8Array to derive the key from

#### `deriveSeed(algorithm, seed?)`

Derives a seed for the specified algorithm from the master seed or a provided seed.

- **Parameters**:
  - `algorithm`: "ed25519" | "falcon" | "ml-dsa" | "ml-kem-aes" | "rsa"
  - `seed?`: Optional Uint8Array to derive from

#### `encrypt(algorithm, data, peerPublicKey)`

Encrypts data using the specified algorithm.

- **Parameters**:
  - `algorithm`: "ml-kem-aes" | "rsa"
  - `data`: Uint8Array to encrypt
  - `peerPublicKey`: Recipient's public key

- **Returns**: `encryptedObject` containing the encrypted data

#### `sign(algorithm, data)`

Signs data using the specified algorithm.

- **Parameters**:
  - `algorithm`: "ml-dsa" | "falcon" | "ed25519"
  - `data`: Uint8Array to sign

- **Returns**: `SignedObject` containing the signature and metadata

#### `decrypt(encryptedObject)`

Decrypts an encrypted object.

- **Parameters**:
  - `encryptedObject`: Object containing encrypted data

- **Returns**: Decrypted data as Uint8Array

#### `verify(signedObject)`

Verifies a signed object.

- **Parameters**:
  - `signedObject`: Object containing signature and metadata

- **Returns**: Boolean indicating if the signature is valid

### Static Methods

#### `getInstance(instanceId?, masterSeed?)`

Gets an instance of UnifiedCrypto by ID, or creates a new one if it doesn't exist.

- **Parameters**:
  - `instanceId?`: Optional string identifier for the instance (defaults to "default")
  - `masterSeed?`: Optional Uint8Array to initialize the instance with

- **Returns**: UnifiedCrypto instance

#### `getInstanceIds()`

Gets the IDs of all existing instances.

- **Returns**: Array of instance IDs

#### `removeInstance(instanceId)`

Removes an instance by ID.

- **Parameters**:
  - `instanceId`: String identifier of the instance to remove

- **Returns**: Boolean indicating if the instance was removed

### Helper Functions

#### `getUnifiedCryptoInstance(instanceId, masterSeed?)`

Convenience function to get a named instance.

- **Parameters**:
  - `instanceId`: String identifier for the instance
  - `masterSeed?`: Optional Uint8Array to initialize the instance with

- **Returns**: UnifiedCrypto instance

### Data Types

#### `encryptedObject`

```typescript
interface encryptedObject {
    algorithm: "ml-kem-aes" | "rsa"
    encryptedData: Uint8Array
    cipherText?: Uint8Array
}
```

#### `SignedObject`

A discriminated union of algorithm-specific signed objects:

```typescript
interface Ed25519SignedObject {
    algorithm: "ed25519"
    signedData: Uint8Array
    publicKey: forge.pki.PublicKey
    message: Uint8Array
}

interface PqcSignedObject {
    algorithm: "ml-dsa" | "falcon"
    signedData: Uint8Array
    publicKey: Uint8Array
    message: Uint8Array
}

type SignedObject = Ed25519SignedObject | PqcSignedObject
```

## Implementation Details

### Multiton Pattern

UnifiedCrypto uses a multiton pattern that allows for multiple instances with separate state, plus a default instance. This provides flexibility while maintaining backward compatibility with the singleton pattern.

### Key Management

Keys are generated from a master seed using HKDF (HMAC-based Key Derivation Function). The master seed can be provided during initialization or generated automatically.

### Type Safety

The class uses TypeScript's discriminated unions to ensure type safety when working with different cryptographic algorithms. This helps catch type errors at compile time rather than runtime.

### Enhanced Proxy

The `unifiedCrypto` proxy provides access to both instance methods and static methods through a single interface. This simplifies the API by allowing users to access all functionality through the proxy without needing to import the class directly.

## Dependencies

- `@noble/hashes`: For cryptographic hash functions and HKDF
- `node-forge`: For RSA and Ed25519 operations
- `Enigma`: Custom class for post-quantum cryptography operations
- `Cryptography`: Custom class for classical cryptography operations

## Security Considerations

- The master seed is a critical security parameter and should be kept secure
- For a decent level of security, is advised to keep the master seed 128 bytes or longer
- Private keys are stored in memory and should be cleared when no longer needed
- The implementation is not designed to be resistant to timing attacks
- For production use, consider adding additional security measures

## Misc

- The master seed acts as an universal private key