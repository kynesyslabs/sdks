import { getKernel } from 'falcon-sign';

// Define interfaces for the types we observed
interface FalconKernel {
    genkey: (seed?: Uint8Array) => FalconKeypair;
    publicKeyCreate: (privateKey: Uint8Array) => Uint8Array;
    sign: (message: string, privateKey: Uint8Array, salt?: Uint8Array) => Uint8Array;
    verify: (signature: Uint8Array, message: string, publicKey: Uint8Array) => boolean;
    algid: string;
    genkeySeedByte: number;
    skByte: number;
    pkByte: number;
    signByte: number;
    signSaltByte: number;
    signNonceByte: number;
}

interface FalconKeypair {
    genkeySeed: Uint8Array;
    sk: Uint8Array;
    pk: Uint8Array;
}

export default class Falcon {
    private kernel!: FalconKernel;
    private keypair!: FalconKeypair;
    private algid: string;

    constructor(algid?: string) {
        if (algid && (algid !== 'falcon512_n3_v1' && algid !== 'falcon1024_n3_v1')) {
            throw new Error(`Invalid algorithm ID: ${algid}\nSupported algorithms: falcon512_n3_v1, falcon1024_n3_v1\nLeave blank for default: falcon512_n3_v1`);
        }
        this.algid = algid || 'falcon512_n3_v1';
    }

    async init(): Promise<void> {
        this.kernel = await getKernel(this.algid);
    }

    // SECTION: Signing
    
    async genkey(seed?: Uint8Array): Promise<void> {
        if (seed) {
            this.keypair = this.kernel.genkey(seed);
        } else {
            this.keypair = this.kernel.genkey();
        }
    }

    async sign(message: string, salt?: Uint8Array): Promise<Uint8Array> {
        if (salt) {
            return this.kernel.sign(message, this.keypair.sk, salt);
        } else {
            return this.kernel.sign(message, this.keypair.sk);
        }
    }

    async verify(message: string, signature: Uint8Array): Promise<boolean> {
        return this.kernel.verify(signature, message, this.keypair.pk);
    }

    async publicKeyCreate(privateKey: Uint8Array): Promise<Uint8Array> {
        return this.kernel.publicKeyCreate(privateKey);
    }

    // SECTION: Getters

    async getPublicKey(): Promise<Uint8Array> {
        return this.keypair.pk;
    }

    async getPrivateKey(): Promise<Uint8Array> {
        return this.keypair.sk;
    }

    async getAlgid(): Promise<string> {
        return this.algid;
    }

    async getKeypair(): Promise<FalconKeypair> {
        return this.keypair;
    }

    async getKernel(): Promise<FalconKernel> {
        return this.kernel;
    }

    // Helper methods for hex string conversion

    /**
     * Convert a Uint8Array to a hex string
     * @param array The Uint8Array to convert
     * @returns A hex string representation of the Uint8Array
     */
    static uint8ArrayToHex(array: Uint8Array): string {
        return Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert a hex string to a Uint8Array
     * @param hex The hex string to convert
     * @returns A Uint8Array representation of the hex string
     */
    static hexToUint8Array(hex: string): Uint8Array {
        // Remove any non-hex characters
        hex = hex.replace(/[^0-9a-fA-F]/g, '');
        
        // Ensure the hex string has an even length
        if (hex.length % 2 !== 0) {
            hex = '0' + hex;
        }
        
        const array = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return array;
    }

    /**
     * Get the public key as a hex string
     * @returns A hex string representation of the public key
     */
    async getPublicKeyHex(): Promise<string> {
        const publicKey = await this.getPublicKey();
        return Falcon.uint8ArrayToHex(publicKey);
    }

    /**
     * Get the private key as a hex string
     * @returns A hex string representation of the private key
     */
    async getPrivateKeyHex(): Promise<string> {
        const privateKey = await this.getPrivateKey();
        return Falcon.uint8ArrayToHex(privateKey);
    }

    /**
     * Sign a message and return the signature as a hex string
     * @param message The message to sign
     * @returns A hex string representation of the signature
     */
    async signHex(message: string): Promise<string> {
        const signature = await this.sign(message);
        return Falcon.uint8ArrayToHex(signature);
    }

    /**
     * Verify a signature provided as a hex string
     * @param message The message that was signed
     * @param signatureHex The signature as a hex string
     * @returns True if the signature is valid, false otherwise
     */
    async verifyHex(message: string, signatureHex: string): Promise<boolean> {
        const signature = Falcon.hexToUint8Array(signatureHex);
        return this.verify(message, signature);
    }

    /**
     * Create a public key from a private key provided as a hex string
     * @param privateKeyHex The private key as a hex string
     * @returns A hex string representation of the public key
     */
    async publicKeyCreateHex(privateKeyHex: string): Promise<string> {
        const privateKey = Falcon.hexToUint8Array(privateKeyHex);
        const publicKey = await this.publicKeyCreate(privateKey);
        return Falcon.uint8ArrayToHex(publicKey);
    }

    /**
     * Set a private key from a hex string
     * @param privateKeyHex The private key as a hex string
     * @returns The public key as a hex string
     */
    async setPrivateKeyHex(privateKeyHex: string): Promise<string> {
        const privateKey = Falcon.hexToUint8Array(privateKeyHex);
        const publicKey = await this.publicKeyCreate(privateKey);
        
        // Update the keypair
        this.keypair = {
            genkeySeed: new Uint8Array(0), // We don't have the seed
            sk: privateKey,
            pk: publicKey
        };
        
        return Falcon.uint8ArrayToHex(publicKey);
    }

    /**
     * Convert a Uint8Array to a base64 string
     * @param array The Uint8Array to convert
     * @returns A base64 string representation of the Uint8Array
     */
    static uint8ArrayToBase64(array: Uint8Array): string {
        return Buffer.from(array).toString('base64');
    }

    /**
     * Convert a base64 string to a Uint8Array
     * @param base64 The base64 string to convert
     * @returns A Uint8Array representation of the base64 string
     */
    static base64ToUint8Array(base64: string): Uint8Array {
        return Buffer.from(base64, 'base64');
    }

    /**
     * Get the public key as a base64 string
     * @returns A base64 string representation of the public key
     */
    async getPublicKeyBase64(): Promise<string> {
        const publicKey = await this.getPublicKey();
        return Falcon.uint8ArrayToBase64(publicKey);
    }

    /**
     * Get the private key as a base64 string
     * @returns A base64 string representation of the private key
     */
    async getPrivateKeyBase64(): Promise<string> {
        const privateKey = await this.getPrivateKey();
        return Falcon.uint8ArrayToBase64(privateKey);
    }

    /**
     * Sign a message and return the signature as a base64 string
     * @param message The message to sign
     * @returns A base64 string representation of the signature
     */
    async signBase64(message: string): Promise<string> {
        const signature = await this.sign(message);
        return Falcon.uint8ArrayToBase64(signature);
    }

    /**
     * Verify a signature provided as a base64 string
     * @param message The message that was signed
     * @param signatureBase64 The signature as a base64 string
     * @returns True if the signature is valid, false otherwise
     */
    async verifyBase64(message: string, signatureBase64: string): Promise<boolean> {
        const signature = Falcon.base64ToUint8Array(signatureBase64);
        return this.verify(message, signature);
    }

    /**
     * Create a public key from a private key provided as a base64 string
     * @param privateKeyBase64 The private key as a base64 string
     * @returns A base64 string representation of the public key
     */
    async publicKeyCreateBase64(privateKeyBase64: string): Promise<string> {
        const privateKey = Falcon.base64ToUint8Array(privateKeyBase64);
        const publicKey = await this.publicKeyCreate(privateKey);
        return Falcon.uint8ArrayToBase64(publicKey);
    }

    /**
     * Set a private key from a base64 string
     * @param privateKeyBase64 The private key as a base64 string
     * @returns The public key as a base64 string
     */
    async setPrivateKeyBase64(privateKeyBase64: string): Promise<string> {
        const privateKey = Falcon.base64ToUint8Array(privateKeyBase64);
        const publicKey = await this.publicKeyCreate(privateKey);
        
        // Update the keypair
        this.keypair = {
            genkeySeed: new Uint8Array(0), // We don't have the seed
            sk: privateKey,
            pk: publicKey
        };
        
        return Falcon.uint8ArrayToBase64(publicKey);
    }
}