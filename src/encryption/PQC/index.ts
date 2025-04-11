/* INFO Enigma - An experimental wrapper for Post Quantum Cryptography in Typescript designed with ease of use in mind
  Currently suggested and tested schemas for each algorithm are:
  - Signing: ml-dsa or falcon
  - Encryption: NTRU
  - Hashing: SHA-3

  While implemented, the following algorithms are not included in the pqc test suite:
  - Key Encapsulation: McEliece

  While implemented, the following algorithms are not fully tested:
  - ChaCha20-Poly1305

  To properly test the encryption and decryption of data, please see the pqc test suite.
*/
import { McEliece } from "mceliece-nist"
import { keccak_256 } from "js-sha3"
import * as crypto from "crypto"
import { ntru } from "ntru"
import { Falcon } from "./falconts" 
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa"
import { utf8ToBytes, bytesToUtf8 } from "./ml-dsa/utils"
import { randomBytes } from '@noble/hashes/utils';
import { FalconKeypair } from "falcon-sign"

/**
 * TODO Add falcon support for signing and verification
 *  -> add falconKeyPair with proper type
 *  -> add sign and verify methods for falcon
 *  -> add export and import methods for falcon
 *  -> add mnemonics support for falcon
 * 
 * 
 */

// INFO Interface to happily work with almost any keypair
export interface IKeypair {
    privateKey: Uint8Array
    publicKey: Uint8Array
}

// INFO Main class
export default class Enigma {
    signingKeyPair: IKeypair = null
    signingSeed: Uint8Array = null
    falconKeyPair: FalconKeypair = null 
    chaCha20Keypair: IKeypair = null
    mcelieceKeypair: IKeypair = null
    ntruKeyPair: IKeypair = null
    private kem: McEliece = new McEliece("mceliece8192128")
    
    // Nonce size for ChaCha20-Poly1305 (12 bytes = 96 bits)
    private readonly NONCE_SIZE = 12

    constructor() {}

    /**
     * Generates a cryptographically secure random value of specified length
     * @param length The length of the random value in bytes
     * @returns A Buffer containing random bytes
     */
    private generateRandomBytes(length: number): Buffer {
        return crypto.randomBytes(length)
    }

    
    /**
     * Generates a key pair for encryption with NTRU
     * @returns A promise that resolves when the key pair is generated
     */
    async genNTRUKeyPair() {
        this.ntruKeyPair = await ntru.keyPair()
    }

    /**
     * Generates a key pair for mcEliece
     * @returns A promise that resolves when the key pair is generated
     */
    async genMcElieceKeyPair() {
        this.mcelieceKeypair = this.kem.keypair()
    }


    /**
     * Generates a Falcon key pair
     * @param seed The seed to use for key generation
     * @returns A promise that resolves when the key pair is generated
     */
    async genFalconKeyPair(seed: Uint8Array = null) {
        if (!seed) {
            seed = randomBytes(48)
        }
        const falcon = new Falcon()
        await falcon.init()
        await falcon.genkey(seed)
        this.falconKeyPair = await falcon.getKeypair()
    }

    

    /**
     * Generates a signing key pair
     * @param seed The seed to use for key generation
     * @returns A promise that resolves when the key pair is generated
     */
    async genSigningKeyPair(seed: Uint8Array = null) {
        if (!seed) {
            seed = randomBytes(32)
        }
        this.signingSeed = seed
        const dlKeys = ml_dsa65.keygen(seed)
        this.signingKeyPair = {
            privateKey: dlKeys.secretKey,
            publicKey: dlKeys.publicKey
        }
    }
    /* SECTION Signatures with ml-dsa */

    /**
     * Signs a message using ml-dsa
     * @param message The message to sign
     * @returns A promise that resolves to the signature
     */
    async sign(message: string | Uint8Array) {
        if (typeof message === "string") {
            message = utf8ToBytes(message)
        }
        const signature = ml_dsa65.sign(this.signingKeyPair.privateKey, message)
        return signature
    }
    
    /**
     * Verifies a signature using ml-dsa
     * @param message The message to verify
     * @param signature The signature to verify
     * @returns A promise that resolves to true if the signature is valid
     */
    async verify(publicKey: string | Uint8Array, message: string | Uint8Array, signature: string | Uint8Array) {
        if (typeof publicKey === "string") {
            publicKey = utf8ToBytes(publicKey)
        }
        if (typeof message === "string") {
            message = utf8ToBytes(message)
        }
        if (typeof signature === "string") {
            signature = utf8ToBytes(signature)
        }
        const isValid = ml_dsa65.verify(publicKey, message, signature)
        return isValid
    }


    // ml-dsa utils
    async getPublicKey(str: boolean = true) {
        if (str) {
            return bytesToUtf8(this.signingKeyPair.publicKey)
        }
        return this.signingKeyPair.publicKey
    }

    async getPrivateKey(str: boolean = true) {
        if (str) {
            return bytesToUtf8(this.signingKeyPair.privateKey)
        }
        return this.signingKeyPair.privateKey
    }

    async getSeed(str: boolean = false) {
        if (str) {
            return bytesToUtf8(this.signingSeed)
        }
        return this.signingSeed
    }

    async setSeed(seed: string | Uint8Array) {
        if (typeof seed === "string") {
            seed = utf8ToBytes(seed)
        }
        await this.genSigningKeyPair(seed)
    }

    /* SECTION Signatures with Falcon */

    /**
     * Signs a message using Falcon
     * @param message The message to sign
     * @param salt Optional salt for signing
     * @returns A promise that resolves to the signature
     */
    async signFalcon(message: string | Uint8Array, salt: string | Uint8Array = null) {
        const falcon = new Falcon()
        await falcon.init()
        await falcon.setKeypair(this.falconKeyPair)
        if (!(typeof message === "string")) {
            message = bytesToUtf8(message)
        }
        if (salt) {
            if (typeof salt === "string") {
                salt = utf8ToBytes(salt)
            }
        }
        const signature = await falcon.sign(message, salt as Uint8Array | null)
        return signature
    }

    /**
     * Signs a message using Falcon and returns the signature as a hex string
     * @param message The message to sign
     * @returns A promise that resolves to the signature as a hex string
     */
    async signFalconHex(message: string | Uint8Array) {
        const signature = await this.signFalcon(message)
        return Falcon.uint8ArrayToHex(signature)
    }

    /**
     * Signs a message using Falcon and returns the signature as a base64 string
     * @param message The message to sign
     * @returns A promise that resolves to the signature as a base64 string
     */
    async signFalconBase64(message: string | Uint8Array) {
        const signature = await this.signFalcon(message)
        return Falcon.uint8ArrayToBase64(signature)
    }

    /**
     * Verifies a signature using Falcon
     * @param message The message to verify
     * @param signature The signature to verify
     * @param publicKey The public key to use for verification
     * @returns A promise that resolves to true if the signature is valid
     */
    async verifyFalcon(message: string | Uint8Array, signature: Uint8Array, publicKey: string | Uint8Array) {
        const falcon = new Falcon()
        await falcon.init()
        if (!(typeof message === "string")) {
            message = bytesToUtf8(message)
        }
        if (typeof publicKey === "string") {
            publicKey = utf8ToBytes(publicKey)
        }
        const isValid = await falcon.verify(message, signature, publicKey)
        return isValid
    }

    /**
     * Verifies a signature using Falcon with hex format
     * @param message The message to verify
     * @param signatureHex The signature to verify as a hex string
     * @param publicKeyHex The public key to use for verification as a hex string
     * @returns A promise that resolves to true if the signature is valid
     */
    async verifyFalconHex(message: string | Uint8Array, signatureHex: string, publicKeyHex: string) {
        const signature = Falcon.hexToUint8Array(signatureHex)
        const publicKey = Falcon.hexToUint8Array(publicKeyHex)
        return this.verifyFalcon(message, signature, publicKey)
    }

    /**
     * Verifies a signature using Falcon with base64 format
     * @param message The message to verify
     * @param signatureBase64 The signature to verify as a base64 string
     * @param publicKeyBase64 The public key to use for verification as a base64 string
     * @returns A promise that resolves to true if the signature is valid
     */
    async verifyFalconBase64(message: string | Uint8Array, signatureBase64: string, publicKeyBase64: string) {
        const signature = Falcon.base64ToUint8Array(signatureBase64)
        const publicKey = Falcon.base64ToUint8Array(publicKeyBase64)
        return this.verifyFalcon(message, signature, publicKey)
    }
    
    // falcon utils
    async getPublicKeyFalcon(str: boolean = true) {
        if (str) {
            return bytesToUtf8(this.falconKeyPair.pk)
        }
        return this.falconKeyPair.pk
    }

    async getPrivateKeyFalcon(str: boolean = true) {
        if (str) {
            return bytesToUtf8(this.falconKeyPair.sk)
        }
        return this.falconKeyPair.sk
    }

    /**
     * Gets the Falcon public key as a hex string
     * @returns A promise that resolves to the public key as a hex string
     */
    async getPublicKeyFalconHex() {
        return Falcon.uint8ArrayToHex(this.falconKeyPair.pk)
    }

    /**
     * Gets the Falcon private key as a hex string
     * @returns A promise that resolves to the private key as a hex string
     */
    async getPrivateKeyFalconHex() {
        return Falcon.uint8ArrayToHex(this.falconKeyPair.sk)
    }

    /**
     * Gets the Falcon public key as a base64 string
     * @returns A promise that resolves to the public key as a base64 string
     */
    async getPublicKeyFalconBase64() {
        return Falcon.uint8ArrayToBase64(this.falconKeyPair.pk)
    }

    /**
     * Gets the Falcon private key as a base64 string
     * @returns A promise that resolves to the private key as a base64 string
     */
    async getPrivateKeyFalconBase64() {
        return Falcon.uint8ArrayToBase64(this.falconKeyPair.sk)
    }

    /**
     * Sets the Falcon private key from a hex string
     * @param privateKeyHex The private key as a hex string
     * @returns A promise that resolves to the public key as a hex string
     */
    async setPrivateKeyFalconHex(privateKeyHex: string) {
        const falcon = new Falcon()
        await falcon.init()
        const privateKey = Falcon.hexToUint8Array(privateKeyHex)
        const publicKey = await falcon.publicKeyCreate(privateKey)
        
        // Update the keypair
        this.falconKeyPair = {
            genkeySeed: new Uint8Array(0), // We don't have the seed
            sk: privateKey,
            pk: publicKey
        }
        
        return Falcon.uint8ArrayToHex(publicKey)
    }

    /**
     * Sets the Falcon private key from a base64 string
     * @param privateKeyBase64 The private key as a base64 string
     * @returns A promise that resolves to the public key as a base64 string
     */
    async setPrivateKeyFalconBase64(privateKeyBase64: string) {
        const falcon = new Falcon()
        await falcon.init()
        const privateKey = Falcon.base64ToUint8Array(privateKeyBase64)
        const publicKey = await falcon.publicKeyCreate(privateKey)
        
        // Update the keypair
        this.falconKeyPair = {
            genkeySeed: new Uint8Array(0), // We don't have the seed
            sk: privateKey,
            pk: publicKey
        }
        
        return Falcon.uint8ArrayToBase64(publicKey)
    }

    /* SECTION Keys generation and incapsulation with McEliece */

    /**
     * Generates a shared secret using the McEliece key encapsulation mechanism
     * @param peerPublicKey The public key of the peer
     * @returns A promise that resolves to an object containing the secret and encrypted key
     */
    async generateSecrets(peerPublicKey: any) {
        let { key, encryptedKey } = await this.kem.generateKey(peerPublicKey)
        let normalizedResult = {
            secret: key,
            shared: encryptedKey,
        }
        return normalizedResult
    }

    /**
     * Derives a shared secret using the McEliece key encapsulation mechanism
     * @param shared The encrypted key
     * @returns A promise that resolves to the derived secret
     */
    async deriveSharedSecret(shared: any) {
        let secret = await this.kem.decryptKey(
            this.mcelieceKeypair.privateKey,
            shared,
        )
        return secret
    }

    /* SECTION Hashing with SHA-3 */

    /**
     * Hashes data using SHA-3 (Keccak-256)
     * @param input The data to hash
     * @returns A promise that resolves to the hash as a hex string
     */
    async hash(input: string | Buffer): Promise<string> {
        if (typeof input === "string") {
            input = Buffer.from(input, "utf8")
        }
        
        // Use keccak_256 (SHA-3) for hashing
        // Convert Buffer to hex string for js-sha3
        const hash = keccak_256(input)
        return hash
    }

    /**
     * Verifies if a hash matches the hash of the input data
     * @param input The data to hash
     * @param hash The hash to verify against
     * @returns A promise that resolves to true if the hash matches
     */
    async checkHash(input: string | Buffer, hash: string): Promise<boolean> {
        if (typeof input === "string") {
            input = Buffer.from(input, "utf8")
        }
        
        // Calculate hash and compare
        const calculatedHash = keccak_256(input)
        return calculatedHash === hash
    }

    /* SECTION Symmetric encryption and decryption with ChaCha20-Poly1305 */

    /**
     * Encrypts data using ChaCha20-Poly1305 with a secure random nonce
     * @param input The data to encrypt
     * @param key The encryption key (32 bytes for 256 bits)
     * @returns A Buffer containing the nonce prepended to the ciphertext
     */
    async encrypt(input: string | Buffer, key: string | Buffer): Promise<Buffer> {
        // Convert key to Buffer if it's a string
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
        
        // Validate key length - ChaCha20-Poly1305 requires a 32-byte key
        if (keyBuffer.length !== 32) {
            throw new Error("Key must be 32 bytes long for ChaCha20-Poly1305")
        }
        
        // Generate a secure random nonce
        const nonce = this.generateRandomBytes(this.NONCE_SIZE);
        
        // Convert input to Buffer if it's a string
        const inputBuffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
        
        // Create cipher with the key and nonce
        const cipher = crypto.createCipheriv('chacha20-poly1305', keyBuffer, nonce, {
            authTagLength: 16 // 128-bit authentication tag
        });
        
        // Encrypt the data
        const encrypted = Buffer.concat([
            cipher.update(inputBuffer),
            cipher.final()
        ]);
        
        // Get the authentication tag
        const authTag = cipher.getAuthTag();
        
        // Prepend the nonce and append the auth tag to the ciphertext
        return Buffer.concat([nonce, encrypted, authTag]);
    }

    /**
     * Decrypts data using ChaCha20-Poly1305
     * @param input The encrypted data with nonce prepended and auth tag appended
     * @param key The decryption key (32 bytes for 256 bits)
     * @returns A Buffer containing the decrypted plaintext
     */
    async decrypt(input: Buffer, key: string | Buffer): Promise<Buffer> {
        // Convert key to Buffer if it's a string
        const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
        
        // Validate key length - ChaCha20-Poly1305 requires a 32-byte key
        if (keyBuffer.length !== 32) {
            throw new Error("Key must be 32 bytes long for ChaCha20-Poly1305")
        }
        
        // Extract the nonce, ciphertext, and auth tag
        const nonce = input.subarray(0, this.NONCE_SIZE);
        const authTag = input.subarray(input.length - 16); // 16 bytes for auth tag
        const ciphertext = input.subarray(this.NONCE_SIZE, input.length - 16);
        
        // Create decipher with the key and nonce
        const decipher = crypto.createDecipheriv('chacha20-poly1305', keyBuffer, nonce, {
            authTagLength: 16 // 128-bit authentication tag
        });
        
        // Set the authentication tag
        decipher.setAuthTag(authTag);
        
        // Decrypt the data
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);
        
        return decrypted;
    }

    /* SECTION NTRU Encryption and Decryption */

    /**
     * Encrypts data using NTRU
     * @param input The data to encrypt
     * @param publicKey The public key to use for encryption
     * @returns A promise that resolves to an object containing the encrypted data and secret
     */
    async ntruEncrypt(input: string | Uint8Array, publicKey: Uint8Array): Promise<{encrypted: Uint8Array, secret: Uint8Array}> {
        // Convert input to Uint8Array if it's a string
        const inputData = typeof input === 'string' ? new TextEncoder().encode(input) : input;
        
        // Validate public key length
        const publicKeyBytes = await ntru.publicKeyBytes;
        if (publicKey.length !== publicKeyBytes) {
            throw new Error(`Public key must be ${publicKeyBytes} bytes long for NTRU`);
        }
        
        // Encrypt the data using NTRU
        const { cyphertext, secret } = await ntru.encrypt(publicKey);
        
        // Combine the encrypted data with the input
        const combined = new Uint8Array(cyphertext.length + inputData.length);
        combined.set(cyphertext, 0);
        combined.set(inputData, cyphertext.length);
        
        return {
            encrypted: combined,
            secret: secret
        };
    }

    /**
     * Decrypts data using NTRU
     * @param encrypted The encrypted data
     * @param privateKey The private key to use for decryption
     * @returns A promise that resolves to the decrypted data
     */
    async ntruDecrypt(encrypted: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
        // Validate private key length
        const privateKeyBytes = await ntru.privateKeyBytes;
        if (privateKey.length !== privateKeyBytes) {
            throw new Error(`Private key must be ${privateKeyBytes} bytes long for NTRU`);
        }
        
        // Extract the cyphertext from the combined data
        const cyphertextBytes = await ntru.cyphertextBytes;
        const cyphertext = encrypted.subarray(0, cyphertextBytes);
        const data = encrypted.subarray(cyphertextBytes);
        
        // Decrypt the data using NTRU
        const secret = await ntru.decrypt(cyphertext, privateKey);
        
        // Return the decrypted data
        return data;
    }

    /**
     * Exports the NTRU key pair
     * @returns The NTRU key pair
     */
    exportNtruKeys(): IKeypair {
        if (!this.ntruKeyPair) {
            throw new Error("NTRU key pair not initialized. Call init() first.");
        }
        return this.ntruKeyPair;
    }

    /**
     * Imports an NTRU key pair
     * @param keyPair The key pair to import
     */
    importNtruKeys(keyPair: IKeypair): void {
        this.ntruKeyPair = keyPair;
    }
}
