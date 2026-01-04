/**
 * TLSNotary Service - Token-based Attestation Management
 *
 * This module provides functions for managing TLSNotary attestation tokens
 * and storing proofs on the Demos Network blockchain.
 *
 * The attestation flow:
 * 1. Request attestation token (burns 1 DEM) → get tokenId + proxyUrl
 * 2. Perform attestation using the proxy
 * 3. Store proof on-chain or IPFS (burns 1 + ceil(size/1024) DEM)
 *
 * @example
 * ```typescript
 * import { TLSNotaryService } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * const demos = new Demos();
 * await demos.connect('https://node.demos.sh');
 * await demos.connectWallet(mnemonic);
 *
 * const service = new TLSNotaryService(demos);
 *
 * // Request attestation token
 * const { proxyUrl, tokenId } = await service.requestAttestation({
 *   targetUrl: 'https://api.github.com/users/octocat'
 * });
 *
 * // Perform attestation (using TLSNotary class)
 * const tlsn = await demos.tlsnotary();
 * const result = await tlsn.attest({ url: targetUrl });
 *
 * // Store proof on-chain
 * const { txHash } = await service.storeProof(
 *   tokenId,
 *   JSON.stringify(result.presentation),
 *   { storage: 'onchain' }
 * );
 * ```
 */

import type { Demos } from "@/websdk/demosclass"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"

/**
 * Response from requestAttestation
 */
export interface AttestationTokenResponse {
    /** WebSocket proxy URL for this attestation */
    proxyUrl: string
    /** Unique token ID for this attestation */
    tokenId: string
    /** Unix timestamp when token expires */
    expiresAt: number
    /** Number of retry attempts remaining */
    retriesLeft: number
}

/**
 * Response from storeProof
 */
export interface StoreProofResponse {
    /** Transaction hash of the storage transaction */
    txHash: string
    /** Total fee burned for storage (in DEM) */
    storageFee: number
    /** HTTP status code from broadcast (200 = success) */
    broadcastStatus: number
    /** Response message from the node */
    broadcastMessage?: string
}

/**
 * TLSNotary token information
 */
export interface TLSNotaryToken {
    /** Unique token ID */
    tokenId: string
    /** Owner's address */
    owner: string
    /** Target domain for attestation */
    domain: string
    /** Current token status */
    status: "pending" | "used" | "expired" | "stored"
    /** Creation timestamp */
    createdAt: number
    /** Expiration timestamp */
    expiresAt: number
    /** Number of retry attempts remaining */
    retriesLeft: number
    /** Associated proof hash (if stored) */
    proofHash?: string
    /** Storage type (if stored) */
    storageType?: "onchain" | "ipfs"
}

/**
 * Options for requesting an attestation
 */
export interface RequestAttestationOptions {
    /** Target HTTPS URL to attest */
    targetUrl: string
}

/**
 * Options for storing a proof
 */
export interface StoreProofOptions {
    /** Storage location: on-chain or IPFS */
    storage: "onchain" | "ipfs"
}

/**
 * TLSNotary Service for managing attestation tokens and proof storage
 */
export class TLSNotaryService {
    private demos: Demos

    /**
     * Create a new TLSNotaryService instance
     *
     * @param demos - Connected Demos instance with wallet
     */
    constructor(demos: Demos) {
        if (!demos.connected) {
            throw new Error("Demos instance must be connected to a node")
        }
        if (!demos.walletConnected) {
            throw new Error("Wallet must be connected to use TLSNotaryService")
        }
        this.demos = demos
    }

    /**
     * Request an attestation token for a target URL
     *
     * This submits a TLSN_REQUEST native transaction that burns 1 DEM
     * and returns a token ID with a proxy URL for performing the attestation.
     *
     * @param options - Request options including target URL
     * @returns Attestation token response with proxyUrl and tokenId
     *
     * @example
     * ```typescript
     * const { proxyUrl, tokenId } = await service.requestAttestation({
     *   targetUrl: 'https://api.coingecko.com/api/v3/simple/price'
     * });
     * ```
     */
    async requestAttestation(
        options: RequestAttestationOptions,
    ): Promise<AttestationTokenResponse> {
        const { targetUrl } = options

        // Validate URL is HTTPS
        const url = new URL(targetUrl)
        if (url.protocol !== "https:") {
            throw new Error("Only HTTPS URLs are supported for TLS attestation")
        }

        // 1. Create and submit TLSN_REQUEST native transaction (burns 1 DEM)
        const tx = await this.createTlsnRequestTransaction(targetUrl)

        // 2. Confirm and broadcast the transaction
        const confirmResult = await DemosTransactions.confirm(tx, this.demos)
        const broadcastResult = await DemosTransactions.broadcast(
            confirmResult,
            this.demos,
        )

        if (broadcastResult.result !== 200) {
            throw new Error(
                `Failed to submit attestation request: ${broadcastResult.response?.message || "Unknown error"}`,
            )
        }

        // 3. Wait for token to be created by polling with txHash
        // Token is created when tx is processed (included in block), not when broadcast
        const txHash = tx.hash
        let tokenId: string | undefined
        const maxAttempts = 30 // 30 attempts
        const pollInterval = 1000 // 1 second between attempts

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const tokenResponse = await this.demos.nodeCall("tlsnotary.getToken", {
                txHash,
            }) as { token?: { id: string } } | null

            if (tokenResponse?.token?.id) {
                tokenId = tokenResponse.token.id
                break
            }

            // Wait before next attempt
            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval))
            }
        }

        if (!tokenId) {
            throw new Error(
                `Token not created after ${maxAttempts} seconds. Transaction may still be pending in mempool. txHash: ${txHash}`,
            )
        }

        // 4. Get owner address
        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const owner = uint8ArrayToHex(publicKey as Uint8Array)

        // 5. Call nodeCall to get proxy URL using the actual tokenId
        const proxyResponse = (await this.demos.nodeCall("requestTLSNproxy", {
            tokenId,
            owner,
            targetUrl,
        })) as {
            websocketProxyUrl: string
            expiresIn: number
            retriesLeft?: number
        }

        if (!proxyResponse || !proxyResponse.websocketProxyUrl) {
            throw new Error("Failed to get proxy URL from node")
        }

        return {
            proxyUrl: proxyResponse.websocketProxyUrl,
            tokenId,
            expiresAt: Date.now() + (proxyResponse.expiresIn || 30000),
            retriesLeft: proxyResponse.retriesLeft ?? 3,
        }
    }

    /**
     * Store a TLSNotary proof on-chain or IPFS
     *
     * This submits a TLSN_STORE native transaction that burns:
     * - 1 DEM base fee
     * - 1 DEM per KB of proof data
     *
     * @param tokenId - The attestation token ID
     * @param proof - The proof data (JSON string or serialized presentation)
     * @param options - Storage options (on-chain or IPFS)
     * @returns Storage response with transaction hash and fee
     *
     * @example
     * ```typescript
     * const { txHash, storageFee } = await service.storeProof(
     *   tokenId,
     *   JSON.stringify(presentation),
     *   { storage: 'onchain' }
     * );
     * console.log(`Proof stored! Fee: ${storageFee} DEM`);
     * ```
     */
    async storeProof(
        tokenId: string,
        proof: string,
        options: StoreProofOptions,
    ): Promise<StoreProofResponse> {
        const { storage } = options

        // 1. Calculate storage fee
        const proofSizeKB = Math.ceil(proof.length / 1024)
        const storageFee = this.calculateStorageFee(proofSizeKB)

        // 2. Create and submit TLSN_STORE native transaction
        const tx = await this.createTlsnStoreTransaction(
            tokenId,
            proof,
            storage,
            storageFee,
        )

        // 3. Confirm and broadcast
        const confirmResult = await DemosTransactions.confirm(tx, this.demos)
        const broadcastResult = await DemosTransactions.broadcast(
            confirmResult,
            this.demos,
        )

        if (broadcastResult.result !== 200) {
            throw new Error(
                `Failed to store proof: ${broadcastResult.response?.message || "Unknown error"}`,
            )
        }

        return {
            txHash: tx.hash,
            storageFee,
            broadcastStatus: broadcastResult.result,
            broadcastMessage: broadcastResult.response?.message || "Transaction accepted",
        }
    }

    /**
     * Calculate the storage fee for a proof
     *
     * Fee structure:
     * - 1 DEM base fee
     * - 1 DEM per KB of proof data
     *
     * @param proofSizeKB - Size of proof in kilobytes
     * @returns Total fee in DEM
     *
     * @example
     * ```typescript
     * const fee = service.calculateStorageFee(5); // 6 DEM for 5KB proof
     * ```
     */
    calculateStorageFee(proofSizeKB: number): number {
        return 1 + proofSizeKB // 1 DEM base + 1 DEM per KB
    }

    /**
     * Get attestation token information by token ID
     *
     * @param tokenId - The attestation token ID
     * @returns Token information or null if not found
     *
     * @example
     * ```typescript
     * const token = await service.getToken(tokenId);
     * if (token?.status === 'stored') {
     *   console.log('Proof already stored:', token.proofHash);
     * }
     * ```
     */
    async getToken(tokenId: string): Promise<TLSNotaryToken | null> {
        const response = await this.demos.nodeCall("tlsnotary.getToken", {
            tokenId,
        })

        if (!response || response.error) {
            return null
        }

        return response as TLSNotaryToken
    }

    /**
     * Get attestation token information by transaction hash
     *
     * @param txHash - The transaction hash of the TLSN_REQUEST transaction
     * @returns Token information or null if not found
     *
     * @example
     * ```typescript
     * const token = await service.getTokenByTxHash(txHash);
     * ```
     */
    async getTokenByTxHash(txHash: string): Promise<TLSNotaryToken | null> {
        const response = await this.demos.nodeCall("tlsnotary.getToken", {
            txHash,
        })

        if (!response || response.error) {
            return null
        }

        return response as TLSNotaryToken
    }

    /**
     * Create a TLSN_REQUEST native transaction
     * @internal
     */
    private async createTlsnRequestTransaction(targetUrl: string) {
        const tx = DemosTransactions.empty()

        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await this.demos.getAddressNonce(publicKeyHex)

        // Self-directed transaction (burns tokens)
        tx.content.to = publicKeyHex
        tx.content.nonce = nonce + 1
        tx.content.amount = 1 // 1 DEM fee for attestation request
        tx.content.type = "native"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "native",
            {
                nativeOperation: "tlsn_request",
                args: [targetUrl],
            },
        ]

        return await this.demos.sign(tx)
    }

    /**
     * Create a TLSN_STORE native transaction
     * @internal
     */
    private async createTlsnStoreTransaction(
        tokenId: string,
        proof: string,
        storageType: "onchain" | "ipfs",
        fee: number,
    ) {
        const tx = DemosTransactions.empty()

        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await this.demos.getAddressNonce(publicKeyHex)

        // Self-directed transaction (burns tokens)
        tx.content.to = publicKeyHex
        tx.content.nonce = nonce + 1
        tx.content.amount = fee // Storage fee
        tx.content.type = "native"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "native",
            {
                nativeOperation: "tlsn_store",
                args: [tokenId, proof, storageType],
            },
        ]

        return await this.demos.sign(tx)
    }
}

export default TLSNotaryService
