/* INFO Enigma - An experimental wrapper for Post Quantum Cryptography in Typescript designed with ease of use in mind

    LICENSE

    © 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

    Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
    Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

    KyneSys Labs: https://www.kynesys.xyz/

    This module incorporates two Post Quantum Cryptography methods:
    - Rijndael: symmetric encryption algorithm considered the state of the art of its category
    - SHA-3: quantum-safe hashing algorithm
    - McEliece: post-quantum cryptography algorithm that uses a keypair to share secrets between two parties.
    - Dilithium: post-quantum cryptography algorithm that uses a keypair to sign and verify messages.

    The Rijdael algorithm is a symmetric encryption algorithm and as many of the most used symmetric encryption algorithms 
    is considered to be quantum-safe. While even standard AES-256 is considered to be quantum-safe, the Rijndael algorithm
    is considered to improve robustness, performance, and security when compared to standard AES-256 as AES specification
    is a subset of Rijdael algorithm itself.

    The SHA-3 algorithm is a quantum-safe hashing algorithm that is designed to protect against various dehashing attacks.
    It is used to replace less secure hashing algorithms such as SHA-1, SHA-256, and so on.

    The McEliece algorithm is used to encrypt and decrypt messages, much like a symmetric classic encryption algorithm.
    Thanks to its post-quantum security, however, it is not possible to retrieve the secrets as easily as with a classic algorithm.
    We use McEliece to exchange a long-term secret between two parties. This secret will be the base to generate one-time secrets
    encrypted with McEliece itself that will be used to generate one-time symmetric keys.

    The Dilithium algorithm is used to sign and verify messages, much like algorithms like ed25519.
    Apart from providing post quantum security, the Dilithium algorithm is also capable of generating combined signed messages
    that can be used to verify signatures without sharing the initial message, as proofs of authenticity.

    Credits:
    - https://github.com/Snack-X for https://github.com/Snack-X/rijndael-js
    - https://github.com/ranisalt for https://github.com/ranisalt/node-argon2
    - https://github.com/cyph for its https://github.com/cyph/pqcrypto.js library (superdilithium, supersphincs and a lot of knowledge)
    - https://github.com/tniessen for its https://github.com/tniessen/node-mceliece-nist library (mceliece and a lot of knowledge too)
    - I can't find the ntru library developer unfortunately, feel free to contact me if its you

*/
import { McEliece } from "mceliece-nist"
import { superDilithium } from "superdilithium"
import { keccak_256 } from "js-sha3"
import * as crypto from "crypto"
import { ntru } from "ntru"

// INFO Interface to happily work with almost any keypair
export interface IKeypair {
    privateKey: Uint8Array
    publicKey: Uint8Array
}

// INFO Main class
export default class Enigma {
    signingKeyPair: IKeypair = null
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
     * Initializes the cryptographic key pairs for signing and key encapsulation
     * @returns A promise that resolves when initialization is complete
     */
    async init() {
        this.signingKeyPair = await superDilithium.keyPair()
        this.mcelieceKeypair = this.kem.keypair()
        this.ntruKeyPair = await ntru.keyPair()
    }

    /* SECTION Signatures with superDilithium */

    /**
     * Signs a message and combines it with the original message
     * @param message The message to sign
     * @param additionalData Optional additional data to include in the signature
     * @returns A promise that resolves to the combined signed message
     */
    async combinedSign(
        message: string,
        additionalData: string = null,
    ): Promise<Uint8Array> {
        let bufMessage = Buffer.from(message, "utf8")
        let signed: Uint8Array
        if (additionalData) {
            let bufAdditionalData = Buffer.from(additionalData, "utf8")
            signed = await superDilithium.sign(
                bufMessage,
                this.signingKeyPair.privateKey,
                bufAdditionalData,
            )
        } else {
            signed = await superDilithium.sign(
                bufMessage,
                this.signingKeyPair.privateKey,
            )
        }
        return signed
    }

    /**
     * Verifies a combined signed message
     * @param signed The combined signed message
     * @param publicKey The public key to use for verification
     * @param additionalData Optional additional data that was included in the signature
     * @returns A promise that resolves to the original message if verification succeeds
     */
    async combinedVerify(
        signed: Uint8Array,
        publicKey: Uint8Array,
        additionalData: string = null,
    ): Promise<Uint8Array> {
        let verifyData: Uint8Array
        if (additionalData) {
            let bufAdditionalData = Buffer.from(additionalData, "utf8")
            verifyData = await superDilithium.open(
                signed,
                publicKey,
                bufAdditionalData,
            )
        } else {
            verifyData = await superDilithium.open(signed, publicKey)
        }
        return verifyData
    }

    /**
     * Signs a message without combining it with the original message
     * @param message The message to sign
     * @param additionalData Optional additional data to include in the signature
     * @returns A promise that resolves to the signature
     */
    async sign(
        message: string | Uint8Array,
        additionalData: string | Uint8Array = null,
    ) {
        if (typeof message === "string") {
            message = Buffer.from(message, "utf8")
        }
        if (typeof additionalData === "string") {
            additionalData = Buffer.from(additionalData, "utf8")
        }
        // Signing
        let signed: Uint8Array
        if (additionalData) {
            signed = await superDilithium.signDetached(
                message,
                this.signingKeyPair.privateKey,
                additionalData,
            )
        } else {
            signed = await superDilithium.signDetached(
                message,
                this.signingKeyPair.privateKey,
            )
        }
        return signed
    }

    /**
     * Verifies a signature
     * @param signature The signature to verify
     * @param message The original message
     * @param publicKey The public key to use for verification
     * @param additionalData Optional additional data that was included in the signature
     * @returns A promise that resolves to true if verification succeeds
     */
    async verify(
        signature: Uint8Array,
        message: string | Uint8Array,
        publicKey: Uint8Array,
        additionalData: string | Uint8Array = null,
    ) {
        if (typeof message === "string") {
            message = Buffer.from(message, "utf8")
        }
        if (typeof additionalData === "string") {
            additionalData = Buffer.from(additionalData, "utf8")
        }
        // Verifying
        let verified: boolean
        if (additionalData) {
            verified = await superDilithium.verifyDetached(
                signature,
                message,
                publicKey,
                additionalData,
            )
        } else {
            verified = await superDilithium.verifyDetached(
                signature,
                message,
                publicKey,
            )
        }
        return verified
    }

    /**
     * Exports the signing key pair
     * @param passphrase Optional passphrase to encrypt the keys
     * @returns A promise that resolves to the exported keys
     */
    async exportSigningKeys(passphrase: string = null): Promise<any> {
        let storage: any
        if (passphrase) {
            storage = await superDilithium.exportKeys(
                this.signingKeyPair,
                passphrase,
            )
        } else {
            storage = await superDilithium.exportKeys(this.signingKeyPair)
        }
        return storage
    }

    /**
     * Imports a signing key pair
     * @param storage The exported keys to import
     * @param passphrase Optional passphrase to decrypt the keys
     * @returns A promise that resolves to the imported key pair
     */
    async importSigningKeys(
        storage: any,
        passphrase: string = null,
    ): Promise<any> {
        if (passphrase) {
            this.signingKeyPair = await superDilithium.importKeys(
                storage,
                passphrase,
            )
        } else {
            this.signingKeyPair = await superDilithium.importKeys(storage)
        }
        return this.signingKeyPair
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
