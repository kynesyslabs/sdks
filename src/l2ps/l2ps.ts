import { UnifiedCrypto } from "@/encryption/unifiedCrypto";
import * as forge from "node-forge";
import { Hashing } from "@/encryption/Hashing";
import { Transaction } from "@/types";

/**
 * L2PSConfig is the standard configuration for L2PSes.
 */
export interface L2PSConfig {
    uid: string
    config: {
        "created_at_block": number,
        "known_rpcs": string[],
    }
}

/**
 * L2PS is the main class for L2PSes.
 * It provides SDK methods for interacting with L2PSes.
 * Is a multi-singleton class
 */
export default class L2PS {
    private static instances: Map<string, L2PS> = new Map()
    private privateKey: forge.Bytes
    private iv: forge.Bytes

    public config: L2PSConfig
    public id: string

    constructor(privateKey: forge.Bytes, iv: forge.Bytes) {
        this.privateKey = privateKey
        this.iv = iv
        this.id = Hashing.sha256(privateKey)
        L2PS.instances.set(this.id, this)
    }

    /**
     * Creates a new L2PS instance.
     * @param privateKey - The private key for the L2PS (optional, will be generated if not provided)
     * @param iv - The initialization vector for the L2PS (optional, will be generated if not provided)
     * @returns A new L2PS instance.
     */
    static async create(privateKey?: string, iv?: string) {
        if (!privateKey) {
            privateKey = forge.random.getBytesSync(16)
        }
        if (!iv) {
            iv = forge.random.getBytesSync(16)
        }
        return new L2PS(privateKey, iv)
    }

    static async getInstance(id: string): Promise<L2PS> {
        return L2PS.instances.get(id)
    }

    static async getInstances(): Promise<L2PS[]> {
        return Array.from(L2PS.instances.values())
    }

    /* SECTION Insance methods */

    /**
     * Encrypts a transaction.
     * @param tx - The transaction to encrypt.
     * @returns The encrypted transaction using the L2PS's private key and iv.
     */
    async encryptTx(tx: Transaction) {
        const txString = JSON.stringify(tx)
        const txBuffer = forge.util.createBuffer(txString)
        var cipher = forge.cipher.createCipher('AES-GCM', this.privateKey)
        cipher.start({ iv: this.iv })
        cipher.update(txBuffer)
        cipher.finish()
        return cipher.output
    }

    /**
     * Decrypts a transaction.
     * @param encryptedTx - The encrypted transaction to decrypt.
     * @returns The decrypted transaction.
     */
    async decryptTx(encryptedTx: forge.Bytes) {
        var decipher = forge.cipher.createDecipher('AES-GCM', this.privateKey)
        decipher.start({ iv: this.iv })
        decipher.update(forge.util.createBuffer(encryptedTx))
        decipher.finish()
        return JSON.parse(decipher.output.toString())
    }

    async getPemKey(): Promise<string> {
        return this.privateKey
    }

}