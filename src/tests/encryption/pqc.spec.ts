import Enigma from '../../encryption/PQC';
import * as crypto from 'crypto';

describe('Enigma PQC Library', () => {
  let enigma: Enigma;
  
  beforeAll(async () => {
    enigma = new Enigma();
    await enigma.init();
  });
  
  describe('Digital Signatures', () => {
    it('should sign and verify a message', async () => {
      const message = 'Hello, quantum world!';
      
      // Sign the message
      const signature = await enigma.sign(message);
      expect(signature).toBeDefined();
      expect(signature).toBeInstanceOf(Uint8Array);
      
      // Verify the signature
      const isValid = await enigma.verify(
        signature,
        message,
        enigma.signingKeyPair.publicKey
      );
      expect(isValid).toBe(true);
    });
    
    it('should sign and verify a message with additional data', async () => {
      const message = 'Hello, quantum world!';
      const additionalData = 'Additional context';
      
      // Sign the message with additional data
      const signature = await enigma.sign(message, additionalData);
      expect(signature).toBeDefined();
      expect(signature).toBeInstanceOf(Uint8Array);
      
      // Verify the signature with additional data
      const isValid = await enigma.verify(
        signature,
        message,
        enigma.signingKeyPair.publicKey,
        additionalData
      );
      expect(isValid).toBe(true);
      
      // Verify that verification fails with wrong additional data
      const isValidWithWrongData = await enigma.verify(
        signature,
        message,
        enigma.signingKeyPair.publicKey,
        'Wrong context'
      );
      expect(isValidWithWrongData).toBe(false);
    });
    
    it('should perform combined sign and verify', async () => {
      const message = 'Hello, quantum world!';
      
      // Combined sign the message
      const combinedSignature = await enigma.combinedSign(message);
      expect(combinedSignature).toBeDefined();
      expect(combinedSignature).toBeInstanceOf(Uint8Array);
      
      // Combined verify the signature
      const recoveredMessage = await enigma.combinedVerify(
        combinedSignature,
        enigma.signingKeyPair.publicKey
      );
      expect(recoveredMessage).toBeDefined();
      expect(recoveredMessage).toBeInstanceOf(Uint8Array);
      
      // Convert recovered message to string and compare
      const recoveredString = Buffer.from(recoveredMessage).toString('utf8');
      expect(recoveredString).toBe(message);
    });
    
    it('should perform combined sign and verify with additional data', async () => {
      const message = 'Hello, quantum world!';
      const additionalData = 'Additional context';
      
      // Combined sign the message with additional data
      const combinedSignature = await enigma.combinedSign(message, additionalData);
      expect(combinedSignature).toBeDefined();
      expect(combinedSignature).toBeInstanceOf(Uint8Array);
      
      // Combined verify the signature with additional data
      const recoveredMessage = await enigma.combinedVerify(
        combinedSignature,
        enigma.signingKeyPair.publicKey,
        additionalData
      );
      expect(recoveredMessage).toBeDefined();
      expect(recoveredMessage).toBeInstanceOf(Uint8Array);
      
      // Convert recovered message to string and compare
      const recoveredString = Buffer.from(recoveredMessage).toString('utf8');
      expect(recoveredString).toBe(message);
    });
  });
  
  describe('Key Management', () => {
    it('should export and import signing keys', async () => {
      // Export keys without passphrase
      const exportedKeys = await enigma.exportSigningKeys();
      expect(exportedKeys).toBeDefined();
      
      // Create a new instance and import the keys
      const newEnigma = new Enigma();
      await newEnigma.importSigningKeys(exportedKeys);
      
      // Verify that the keys work
      const message = 'Test message';
      const signature = await newEnigma.sign(message);
      const isValid = await newEnigma.verify(
        signature,
        message,
        newEnigma.signingKeyPair.publicKey
      );
      expect(isValid).toBe(true);
    });
    
    it('should export and import signing keys with passphrase', async () => {
      const passphrase = 'secure-passphrase';
      
      // Export keys with passphrase
      const exportedKeys = await enigma.exportSigningKeys(passphrase);
      expect(exportedKeys).toBeDefined();
      
      // Create a new instance and import the keys with passphrase
      const newEnigma = new Enigma();
      await newEnigma.importSigningKeys(exportedKeys, passphrase);
      
      // Verify that the keys work
      const message = 'Test message';
      const signature = await newEnigma.sign(message);
      const isValid = await newEnigma.verify(
        signature,
        message,
        newEnigma.signingKeyPair.publicKey
      );
      expect(isValid).toBe(true);
    });
  });
  
  describe('Key Encapsulation', () => {
    it('should generate and derive shared secrets', async () => {
      // Create a second instance for the peer
      const peerEnigma = new Enigma();
      await peerEnigma.init();
      
      // Generate secrets using the peer's public key
      const { secret, shared } = await enigma.generateSecrets(peerEnigma.mcelieceKeypair.publicKey);
      expect(secret).toBeDefined();
      expect(shared).toBeDefined();
      
      // Derive the same secret on the peer's side
      const derivedSecret = await peerEnigma.deriveSharedSecret(shared);
      expect(derivedSecret).toBeDefined();
      
      // Compare the secrets
      expect(Buffer.compare(secret, derivedSecret)).toBe(0);
    });
  });
  
  describe('Hashing', () => {
    it('should hash and verify data', async () => {
      const data = 'Data to hash';
      
      // Hash the data
      const hash = await enigma.hash(data);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      
      // Verify the hash
      const isValid = await enigma.checkHash(data, hash);
      expect(isValid).toBe(true);
      
      // Verify that a different hash is not valid
      const differentHash = await enigma.hash('Different data');
      const isDifferentValid = await enigma.checkHash(data, differentHash);
      expect(isDifferentValid).toBe(false);
    });
    
    it('should hash and verify Buffer data', async () => {
      const data = Buffer.from('Data to hash', 'utf8');
      
      // Hash the data
      const hash = await enigma.hash(data);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      
      // Verify the hash
      const isValid = await enigma.checkHash(data, hash);
      expect(isValid).toBe(true);
    });
  });
  
  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt data with ChaCha20-Poly1305', async () => {
      const enigma = new Enigma();
      const message = 'This is a secret message that needs to be encrypted securely.';
      const key = crypto.randomBytes(32); // 256-bit key required for ChaCha20-Poly1305
      
      console.log(`Original message: "${message}"`);
      console.log(`Key (hex): ${key.toString('hex')}`);
      
      const encrypted = await enigma.encrypt(message, key);
      console.log(`Encrypted data (hex): ${encrypted.toString('hex')}`);
      console.log(`Encrypted data length: ${encrypted.length} bytes`);
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(message.length);
      
      const decrypted = await enigma.decrypt(encrypted, key);
      const decryptedString = decrypted.toString('utf8');
      console.log(`Decrypted message: "${decryptedString}"`);
      
      expect(decryptedString).toBe(message);
      console.log('Encryption and decryption successful!');
    });
    
    it('should throw error for invalid key sizes', async () => {
      const enigma = new Enigma();
      const message = 'Test message';
      const invalidKey = crypto.randomBytes(20); // Invalid key size for ChaCha20-Poly1305
      
      console.log(`Testing with invalid key size: ${invalidKey.length} bytes`);
      console.log(`Invalid key (hex): ${invalidKey.toString('hex')}`);
      
      await expect(enigma.encrypt(message, invalidKey)).rejects.toThrow('Key must be 32 bytes long for ChaCha20-Poly1305');
      console.log('Encryption with invalid key correctly threw an error');
      
      // Create a valid ciphertext first for decryption test
      const validKey = crypto.randomBytes(32);
      const validCiphertext = await enigma.encrypt(message, validKey);
      
      await expect(enigma.decrypt(validCiphertext, invalidKey)).rejects.toThrow('Key must be 32 bytes long for ChaCha20-Poly1305');
      console.log('Decryption with invalid key correctly threw an error');
    });
    
    it('should handle different input types', async () => {
      const enigma = new Enigma();
      const key = crypto.randomBytes(32);
      
      // Test with string input
      const stringMessage = 'This is a string message';
      const encryptedString = await enigma.encrypt(stringMessage, key);
      const decryptedString = await enigma.decrypt(encryptedString, key);
      expect(decryptedString.toString('utf8')).toBe(stringMessage);
      
      // Test with Buffer input
      const bufferMessage = Buffer.from('This is a buffer message', 'utf8');
      const encryptedBuffer = await enigma.encrypt(bufferMessage, key);
      const decryptedBuffer = await enigma.decrypt(encryptedBuffer, key);
      expect(Buffer.compare(decryptedBuffer, bufferMessage)).toBe(0);
      
      console.log('Different input types handled successfully!');
    });
  });
  
  describe('NTRU Encryption', () => {
    it('should encrypt and decrypt data with NTRU', async () => {
      const message = 'This is a secret message that needs to be encrypted with NTRU.';
      
      // Encrypt the message using NTRU
      const { encrypted, secret } = await enigma.ntruEncrypt(message, enigma.ntruKeyPair.publicKey);
      expect(encrypted).toBeDefined();
      expect(secret).toBeDefined();
      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(secret).toBeInstanceOf(Uint8Array);
      
      // Decrypt the message using NTRU
      const decrypted = await enigma.ntruDecrypt(encrypted, enigma.ntruKeyPair.privateKey);
      expect(decrypted).toBeDefined();
      expect(decrypted).toBeInstanceOf(Uint8Array);
      
      // Convert decrypted data to string and compare
      const decryptedString = new TextDecoder().decode(decrypted);
      expect(decryptedString).toBe(message);
    });
    
    it('should handle different input types for NTRU encryption', async () => {
      const stringMessage = 'This is a string message for NTRU';
      const bufferMessage = new TextEncoder().encode('This is a buffer message for NTRU');
      
      // Test with string input
      const { encrypted: encryptedString, secret: secretString } = await enigma.ntruEncrypt(stringMessage, enigma.ntruKeyPair.publicKey);
      const decryptedString = await enigma.ntruDecrypt(encryptedString, enigma.ntruKeyPair.privateKey);
      expect(new TextDecoder().decode(decryptedString)).toBe(stringMessage);
      
      // Test with Uint8Array input
      const { encrypted: encryptedBuffer, secret: secretBuffer } = await enigma.ntruEncrypt(bufferMessage, enigma.ntruKeyPair.publicKey);
      const decryptedBuffer = await enigma.ntruDecrypt(encryptedBuffer, enigma.ntruKeyPair.privateKey);
      expect(new TextDecoder().decode(decryptedBuffer)).toBe(new TextDecoder().decode(bufferMessage));
    });
    
    it('should throw error for invalid key sizes in NTRU', async () => {
      const message = 'Test message for NTRU';
      const invalidPublicKey = new Uint8Array(10); // Invalid public key size
      const invalidPrivateKey = new Uint8Array(10); // Invalid private key size
      
      // Create a valid encrypted message first
      const { encrypted } = await enigma.ntruEncrypt(message, enigma.ntruKeyPair.publicKey);
      
      // Test encryption with invalid public key
      await expect(enigma.ntruEncrypt(message, invalidPublicKey)).rejects.toThrow();
      
      // Test decryption with invalid private key
      await expect(enigma.ntruDecrypt(encrypted, invalidPrivateKey)).rejects.toThrow();
    });
    
    it('should export and import NTRU keys', async () => {
      // Export NTRU keys
      const exportedKeys = enigma.exportNtruKeys();
      expect(exportedKeys).toBeDefined();
      expect(exportedKeys.privateKey).toBeDefined();
      expect(exportedKeys.publicKey).toBeDefined();
      
      // Create a new instance and import the keys
      const newEnigma = new Enigma();
      newEnigma.importNtruKeys(exportedKeys);
      
      // Verify that the keys work
      const message = 'Test message for NTRU key import/export';
      const { encrypted } = await newEnigma.ntruEncrypt(message, newEnigma.ntruKeyPair.publicKey);
      const decrypted = await newEnigma.ntruDecrypt(encrypted, newEnigma.ntruKeyPair.privateKey);
      expect(new TextDecoder().decode(decrypted)).toBe(message);
    });
  });
}); 