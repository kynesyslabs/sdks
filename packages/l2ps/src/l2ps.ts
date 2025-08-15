/**
 * @fileoverview L2PS (Layer 2 Private Subnets) implementation for DEMOS blockchain.
 * 
 * L2PS provides encrypted transaction processing capabilities as subnets of the main DEMOS network.
 * Transactions are encrypted using AES-GCM for confidentiality and integrity, allowing private
 * transaction processing while maintaining compatibility with the main blockchain infrastructure.
 * 
 * @author Kynesys Labs
 * @version 1.0.0
 */

import * as forge from "node-forge";
import { Hashing } from "@demosdk/encryption";
import { L2PSTransaction, Transaction } from "@demosdk/types";
import { L2PSTransactionContent } from "@demosdk/types";

/**
 * Configuration interface for L2PS instances.
 * Defines the structure for L2PS network configuration and metadata.
 */
export interface L2PSConfig {
    /** Unique identifier for the L2PS network */
    uid: string;
    /** Network configuration parameters */
    config: {
        /** Block number when this L2PS was created */
        created_at_block: number;
        /** List of known RPC endpoints for this L2PS network */
        known_rpcs: string[];
    };
}

/**
 * Payload structure for encrypted transactions within L2PS.
 * Contains the encrypted transaction data and metadata required for decryption and verification.
 */
export interface L2PSEncryptedPayload {
    /** UID of the L2PS network that encrypted this transaction */
    l2ps_uid: string;
    /** Base64-encoded encrypted transaction data */
    encrypted_data: string;
    /** Base64-encoded AES-GCM authentication tag */
    tag: string;
    /** Hash of the original transaction for integrity verification */
    original_hash: string;
}

/**
 * L2PS (Layer 2 Private Subnets) class for encrypted transaction processing.
 * 
 * This class implements a multi-singleton pattern to manage multiple L2PS networks.
 * Each L2PS instance provides AES-GCM encrypted transaction capabilities while maintaining
 * compatibility with the standard DEMOS transaction format.
 * 
 * Key features:
 * - AES-GCM authenticated encryption for transaction confidentiality and integrity
 * - Multi-singleton pattern for managing multiple L2PS networks
 * - Standard Transaction object compatibility for seamless integration
 * - SHA-256 based instance identification
 * 
 * @example
 * ```typescript
 * // Create a new L2PS instance
 * const l2ps = await L2PS.create();
 * 
 * // Encrypt a transaction
 * const encryptedTx = await l2ps.encryptTx(originalTransaction);
 * 
 * // Decrypt a transaction
 * const decryptedTx = await l2ps.decryptTx(encryptedTx);
 * ```
 */
export default class L2PS {
    /** Static map of all L2PS instances, keyed by instance ID */
    private static instances: Map<string, L2PS> = new Map();
    
    /** Private key used for AES encryption (32 bytes for AES-256) */
    private readonly privateKey: forge.Bytes;
    
    /** Initialization vector for AES-GCM (12 bytes for optimal GCM performance) */
    private readonly iv: forge.Bytes;
    
    /** Unique identifier for this L2PS instance (SHA-256 hash of private key) */
    private readonly id: string;

    /** Configuration for this L2PS network (optional) */
    public config?: L2PSConfig;

    /**
     * Private constructor to enforce factory pattern.
     * Creates a new L2PS instance with the provided cryptographic materials.
     * 
     * @param privateKey - AES private key (32 bytes for AES-256)
     * @param iv - Initialization vector for AES-GCM (12 bytes)
     * @throws {Error} If privateKey or iv are not provided
     * @private
     */
    private constructor(privateKey: forge.Bytes, iv: forge.Bytes) {
        if (!privateKey || !iv) {
            throw new Error('Private key and IV are required');
        }
        
        this.privateKey = privateKey;
        this.iv = iv;
        this.id = Hashing.sha256(privateKey);
        L2PS.instances.set(this.id, this);
    }

    /**
     * Factory method to create a new L2PS instance.
     * Generates cryptographically secure random keys if not provided.
     * 
     * @param privateKey - Optional AES private key as string. If not provided, generates 32 random bytes
     * @param iv - Optional initialization vector as string. If not provided, generates 12 random bytes
     * @returns Promise resolving to a new L2PS instance
     * 
     * @example
     * ```typescript
     * // Create with random keys
     * const l2ps1 = await L2PS.create();
     * 
     * // Create with specific keys
     * const l2ps2 = await L2PS.create(myPrivateKey, myIV);
     * ```
     */
    static async create(privateKey?: string, iv?: string): Promise<L2PS> {
        const key = privateKey || forge.random.getBytesSync(32);
        const initVector = iv || forge.random.getBytesSync(12);
        return new L2PS(key, initVector);
    }

    /**
     * Retrieves an existing L2PS instance by its ID.
     * 
     * @param id - The unique identifier of the L2PS instance
     * @returns The L2PS instance if found, undefined otherwise
     */
    static getInstance(id: string): L2PS | undefined {
        return L2PS.instances.get(id);
    }

    /**
     * Returns all currently active L2PS instances.
     * 
     * @returns Array of all L2PS instances
     */
    static getInstances(): L2PS[] {
        return Array.from(L2PS.instances.values());
    }

    /**
     * Checks if an L2PS instance with the given ID exists.
     * 
     * @param id - The unique identifier to check
     * @returns True if the instance exists, false otherwise
     */
    static hasInstance(id: string): boolean {
        return L2PS.instances.has(id);
    }

    /**
     * Removes an L2PS instance from the registry.
     * 
     * @param id - The unique identifier of the instance to remove
     * @returns True if the instance was removed, false if it didn't exist
     */
    static removeInstance(id: string): boolean {
        return L2PS.instances.delete(id);
    }

    /**
     * Encrypts a transaction using AES-GCM and wraps it in a standard Transaction object.
     * 
     * The original transaction is serialized, encrypted with AES-GCM for authenticated encryption,
     * and then wrapped in a new Transaction object with type "l2psEncryptedTx". This allows
     * encrypted transactions to be processed through the standard transaction pipeline.
     * 
     * @param tx - The original transaction to encrypt
     * @param senderIdentity - Optional sender identity to use in the encrypted transaction wrapper
     * @returns Promise resolving to a new Transaction object containing the encrypted data
     * 
     * @throws {Error} If transaction is null/undefined or encryption fails
     * 
     * @example
     * ```typescript
     * const originalTx: Transaction = {  transaction data  };
     * const encryptedTx = await l2ps.encryptTx(originalTx, senderPublicKey);
     * // encryptedTx can now be inserted into mempool like any other transaction
     * ```
     */
    async encryptTx(tx: Transaction, senderIdentity?: any): Promise<L2PSTransaction> {
        if (!tx) {
            throw new Error('Transaction is required for encryption');
        }

        try {
            const txString = JSON.stringify(tx);
            const txBuffer = forge.util.createBuffer(txString);
            const cipher = forge.cipher.createCipher('AES-GCM', this.privateKey);
            
            cipher.start({ iv: this.iv });
            cipher.update(txBuffer);
            
            if (!cipher.finish()) {
                throw new Error('Failed to encrypt transaction');
            }

            const encryptedPayload: L2PSEncryptedPayload = {
                l2ps_uid: this.config?.uid || this.id,
                encrypted_data: forge.util.encode64(cipher.output.getBytes()),
                tag: forge.util.encode64(cipher.mode.tag.getBytes()),
                original_hash: tx.hash
            };

            const encryptedTxContent: L2PSTransactionContent = {
                type: "l2psEncryptedTx",
                from: senderIdentity || tx.content.from,
                to: tx.content.to,
                from_ed25519_address: tx.content.from_ed25519_address,
                amount: 0,
                data: ["l2psEncryptedTx", encryptedPayload],
                gcr_edits: [],
                nonce: tx.content.nonce,
                timestamp: Date.now(),
                transaction_fee: tx.content.transaction_fee
            };

            const encryptedTx: L2PSTransaction = {
                content: encryptedTxContent,
                ed25519_signature: tx.ed25519_signature,
                signature: null,
                hash: Hashing.sha256(JSON.stringify(encryptedTxContent)),
                status: "pending",
                blockNumber: null
            };

            return encryptedTx;
        } catch (error: any) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypts an L2PS encrypted transaction and returns the original transaction.
     * 
     * Validates that the transaction is of type "l2psEncryptedTx", extracts the encrypted payload,
     * verifies the L2PS UID matches, performs AES-GCM decryption with authentication,
     * and validates the original transaction hash for integrity.
     * 
     * @param encryptedTx - Transaction object containing encrypted data
     * @returns Promise resolving to the original decrypted Transaction
     * 
     * @throws {Error} If transaction is not l2psEncryptedTx type, wrong L2PS UID, 
     *                 authentication fails, or hash mismatch
     * 
     * @example
     * ```typescript
     * const encryptedTx: Transaction = {  encrypted transaction  };
     * const originalTx = await l2ps.decryptTx(encryptedTx);
     * // originalTx is now the original transaction before encryption
     * ```
     */
    async decryptTx(encryptedTx: L2PSTransaction): Promise<Transaction> {
        if (!encryptedTx || encryptedTx.content.type !== "l2psEncryptedTx") {
            throw new Error('Transaction must be of type l2psEncryptedTx');
        }

        try {
            const [dataType, payload] = encryptedTx.content.data;
            if (dataType !== "l2psEncryptedTx") {
                throw new Error('Invalid encrypted transaction data type');
            }

            const encryptedPayload = payload as L2PSEncryptedPayload;
            
            if (encryptedPayload.l2ps_uid !== (this.config?.uid || this.id)) {
                throw new Error('Transaction encrypted for different L2PS');
            }
            
            // TODO Verify the signature of the encrypted transaction

            const encryptedData = forge.util.createBuffer(forge.util.decode64(encryptedPayload.encrypted_data));
            const tag = forge.util.createBuffer(forge.util.decode64(encryptedPayload.tag));

            const decipher = forge.cipher.createDecipher('AES-GCM', this.privateKey);
            decipher.start({ 
                iv: this.iv,
                tag: tag
            });
            
            decipher.update(encryptedData);
            
            if (!decipher.finish()) {
                throw new Error('Failed to decrypt transaction - authentication failed');
            }

            const decryptedString = decipher.output.toString();
            const originalTx = JSON.parse(decryptedString) as Transaction;
            
            if (originalTx.hash !== encryptedPayload.original_hash) {
                throw new Error('Decrypted transaction hash mismatch');
            }

            return originalTx;
        } catch (error: any) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Returns the unique identifier for this L2PS instance.
     * The ID is a SHA-256 hash of the private key.
     * 
     * @returns The L2PS instance ID
     */
    getId(): string {
        return this.id;
    }

    /**
     * Returns the current configuration for this L2PS instance.
     * 
     * @returns The L2PS configuration if set, undefined otherwise
     */
    getConfig(): L2PSConfig | undefined {
        return this.config;
    }

    /**
     * Sets the configuration for this L2PS instance.
     * 
     * @param config - The L2PS configuration to set
     * @throws {Error} If config is invalid or missing required UID
     */
    setConfig(config: L2PSConfig): void {
        if (!config || !config.uid) {
            throw new Error('Valid configuration with UID is required');
        }
        this.config = config;
    }

    /**
     * Returns a short fingerprint of the private key for identification purposes.
     * Uses the first 16 characters of the SHA-256 hash of the private key.
     * 
     * @returns Promise resolving to a 16-character fingerprint string
     */
    async getKeyFingerprint(): Promise<string> {
        return Hashing.sha256(this.privateKey).substring(0, 16);
    }
}