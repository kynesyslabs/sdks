import { describe, test, expect, beforeEach } from "bun:test";
import Enigma from "../../encryption/PQC";
import { randomBytes } from "crypto";

describe('Hashing with SHA-3', () => {
  test('should hash a message', async () => {
    let enigma = new Enigma()
    let hash = await enigma.hash('Hello, world!')
    expect(hash).toBeDefined()
  });
})

// SECTION PQC Encryption Tests

describe('PQC Encryption with NTRU', () => {
  beforeEach(async () => {
  });

  describe('Key Generation', () => {
    test('should generate a valid key pair', async () => {
      // Test key generation
      let enigma = new Enigma()
      await enigma.genNTRUKeyPair()
      expect(enigma.ntruKeyPair).toBeDefined()
    });
  });

  describe('Encryption', () => {
    test('should encrypt and decrypt data successfully', async () => {
      // Test encryption
      let enigma = new Enigma()
      await enigma.genNTRUKeyPair()
      let encrypted = await enigma.ntruEncrypt('Hello, world!', enigma.ntruKeyPair.publicKey)
      let decrypted = await enigma.ntruDecrypt(encrypted.encrypted, enigma.ntruKeyPair.privateKey)
      let decryptedString = new TextDecoder().decode(decrypted)
      expect(decryptedString).toBe('Hello, world!')
    });
  });
})

// SECTION Signature Tests

describe('Falcon', () => {
  test('should generate a valid key pair', async () => {
    let enigma = new Enigma()
    await enigma.genFalconKeyPair()
    expect(enigma.falconKeyPair).toBeDefined()
  });

  test('should generate a valid public key given a seed', async () => {
    let enigma = new Enigma()
    let seed = randomBytes(48)
    await enigma.genFalconKeyPair(seed)
    let publicKey = await enigma.getPublicKeyFalcon()
    // Creating a second key pair with the same seed should produce the same public key
    await enigma.genFalconKeyPair(seed)
    let publicKey2 = await enigma.getPublicKeyFalcon()
    expect(publicKey).toEqual(publicKey2)
  });

  test('should import a private key from a hex string', async () => {
    let enigma = new Enigma()
    await enigma.genFalconKeyPair()
    let privateKey = await enigma.getPrivateKeyFalconHex()
    let publicKey = await enigma.getPublicKeyFalconHex()
    await enigma.setPrivateKeyFalconHex(privateKey)
    let publicKey2 = await enigma.getPublicKeyFalconHex()
    expect(publicKey).toEqual(publicKey2)
  });

  test('should sign and verify a message', async () => {
    let enigma = new Enigma()
    await enigma.genFalconKeyPair()
    let signature = await enigma.signFalcon('Hello, world!')
    let isValid = await enigma.verifyFalcon('Hello, world!', signature, enigma.falconKeyPair.pk)
    expect(isValid).toBe(true)
  });
})

describe('ml-dsa', () => {
  test('should generate a valid key pair', async () => {
    let enigma = new Enigma()
    await enigma.genSigningKeyPair()
    expect(enigma.signingKeyPair).toBeDefined()
  });

  test('should import a private key from a seed string', async () => {
    let enigma = new Enigma()
    await enigma.genSigningKeyPair()
    let seed = await enigma.getSeed()
    let publicKey = await enigma.getPublicKey()
    await enigma.genSigningKeyPair(seed as Uint8Array)
    let publicKey2 = await enigma.getPublicKey()
    expect(publicKey).toEqual(publicKey2)
  });

  test('should sign and verify a message', async () => {
    let enigma = new Enigma()
    await enigma.genSigningKeyPair()
    let signature = await enigma.sign('Hello, world!')
    let isValid = await enigma.verify(enigma.signingKeyPair.publicKey, 'Hello, world!', signature)
    expect(isValid).toBe(true)
  });
})
