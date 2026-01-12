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
import { TLSNotary } from "./TLSNotary"
import type { StatusCallback } from "./types"

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
 * Transaction details for user confirmation
 */
export interface TransactionDetails {
    /** The signed transaction object */
    transaction: any
    /** Transaction hash */
    txHash: string
    /** Amount in DEM being burned/spent */
    amount: number
    /** Description of what this transaction does */
    description: string
    /** Target URL for attestation requests */
    targetUrl?: string
    /** Token ID for store transactions */
    tokenId?: string
}

/**
 * Callback for user to confirm or reject a transaction
 * Return true to proceed with broadcast, false to cancel
 */
export type TransactionConfirmCallback = (details: TransactionDetails) => Promise<boolean>

/**
 * Options for methods that require user confirmation
 */
export interface WithConfirmationOptions {
    /** Callback for user to confirm or reject the transaction */
    onConfirm: TransactionConfirmCallback
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
     * Request an attestation token with user confirmation before broadcasting
     *
     * This method shows the transaction details to the user via the onConfirm callback
     * and only broadcasts if the user confirms. This is the recommended way to request
     * attestation tokens in user-facing applications.
     *
     * @param options - Request options including target URL
     * @param confirmOptions - Options containing the confirmation callback
     * @returns Attestation token response with proxyUrl and tokenId
     * @throws Error if user rejects the transaction
     *
     * @example
     * ```typescript
     * const { proxyUrl, tokenId } = await service.requestAttestationWithConfirmation(
     *   { targetUrl: 'https://api.github.com/users/octocat' },
     *   {
     *     onConfirm: async (details) => {
     *       // Show confirmation dialog to user
     *       return await showConfirmDialog({
     *         title: 'Confirm Attestation Request',
     *         message: `This will burn ${details.amount} DEM to request attestation for ${details.targetUrl}`,
     *         txHash: details.txHash,
     *       });
     *     }
     *   }
     * );
     * ```
     */
    async requestAttestationWithConfirmation(
        options: RequestAttestationOptions,
        confirmOptions: WithConfirmationOptions,
    ): Promise<AttestationTokenResponse> {
        const { targetUrl } = options
        const { onConfirm } = confirmOptions

        // Validate URL is HTTPS
        const url = new URL(targetUrl)
        if (url.protocol !== "https:") {
            throw new Error("Only HTTPS URLs are supported for TLS attestation")
        }

        // 1. Create the transaction (but don't broadcast yet)
        const tx = await this.createTlsnRequestTransaction(targetUrl)

        // 2. Get confirmation from user
        const details: TransactionDetails = {
            transaction: tx,
            txHash: tx.hash,
            amount: 1,
            description: "TLSNotary attestation request (burns 1 DEM)",
            targetUrl,
        }

        const confirmed = await onConfirm(details)
        if (!confirmed) {
            throw new Error("Transaction rejected by user")
        }

        // 3. Now confirm and broadcast the transaction
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

        // 4. Wait for token to be created by polling with txHash
        const txHash = tx.hash
        let tokenId: string | undefined
        const maxAttempts = 30
        const pollInterval = 1000

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const tokenResponse = await this.demos.nodeCall("tlsnotary.getToken", {
                txHash,
            }) as { token?: { id: string } } | null

            if (tokenResponse?.token?.id) {
                tokenId = tokenResponse.token.id
                break
            }

            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval))
            }
        }

        if (!tokenId) {
            throw new Error(
                `Token not created after ${maxAttempts} seconds. Transaction may still be pending in mempool. txHash: ${txHash}`,
            )
        }

        // 5. Get owner address
        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const owner = uint8ArrayToHex(publicKey as Uint8Array)

        // 6. Call nodeCall to get proxy URL using the actual tokenId
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
     * Request attestation token and create a pre-configured TLSNotary instance
     *
     * This is the recommended way to perform attestations. It handles:
     * 1. Creating and broadcasting the TLSN_REQUEST transaction
     * 2. Waiting for the token to be created
     * 3. Getting the proxy URL
     * 4. Creating a TLSNotary instance configured with that proxy
     * 5. Initializing the WASM module
     *
     * The returned TLSNotary instance is ready to call `attest()` immediately.
     *
     * @param options - Request options including target URL
     * @param onStatus - Optional status callback for progress updates
     * @returns Object with TLSNotary instance, tokenId, and proxyUrl
     *
     * @example
     * ```typescript
     * const service = new TLSNotaryService(demos);
     *
     * // Get a ready-to-use TLSNotary instance
     * const { tlsn, tokenId, proxyUrl } = await service.createTLSNotary({
     *   targetUrl: 'https://api.github.com/users/octocat'
     * });
     *
     * // Perform attestation - the proxy is already configured!
     * const result = await tlsn.attest({
     *   url: 'https://api.github.com/users/octocat',
     * });
     *
     * // Store proof on-chain
     * await service.storeProof(tokenId, JSON.stringify(result.presentation), { storage: 'onchain' });
     * ```
     */
    async createTLSNotary(
        options: RequestAttestationOptions,
        onStatus?: StatusCallback,
    ): Promise<{ tlsn: TLSNotary; tokenId: string; proxyUrl: string; expiresAt: number }> {
        const status = onStatus || (() => {})

        // Step 1: Request attestation token and get proxy URL
        status("Requesting attestation token...")
        const tokenResponse = await this.requestAttestation(options)

        status(`Token obtained: ${tokenResponse.tokenId}`)

        // Step 2: Get notary info from the node
        status("Getting notary configuration...")
        const notaryInfo = (await this.demos.nodeCall("tlsnotary.getInfo", {})) as {
            notaryUrl: string
            publicKey: string
        }

        if (!notaryInfo?.notaryUrl) {
            throw new Error("Failed to get notary info from node")
        }

        // Step 3: Create TLSNotary instance with the pre-obtained proxy URL
        // IMPORTANT: We only set websocketProxyUrl (not rpcUrl) so that TLSNotary
        // uses our pre-obtained proxy instead of trying to request its own
        status("Creating TLSNotary instance...")
        const tlsn = new TLSNotary({
            notaryUrl: notaryInfo.notaryUrl,
            websocketProxyUrl: tokenResponse.proxyUrl, // Use the proxy we already obtained!
            notaryPublicKey: notaryInfo.publicKey,
            // Note: rpcUrl is intentionally NOT set - this prevents TLSNotary
            // from trying to request its own proxy in getProxyUrl()
        })

        // Step 4: Initialize WASM
        status("Initializing TLSNotary WASM...")
        await tlsn.initialize()

        status("TLSNotary ready for attestation!")

        return {
            tlsn,
            tokenId: tokenResponse.tokenId,
            proxyUrl: tokenResponse.proxyUrl,
            expiresAt: tokenResponse.expiresAt,
        }
    }

    /**
     * Request attestation token and create a pre-configured TLSNotary instance
     * WITH user confirmation before broadcasting the transaction.
     *
     * This is the recommended way to perform attestations in user-facing applications.
     * It handles:
     * 1. Creating the TLSN_REQUEST transaction
     * 2. **Asking the user to confirm via the onConfirm callback**
     * 3. Broadcasting the transaction if confirmed
     * 4. Waiting for the token to be created
     * 5. Getting the proxy URL
     * 6. Creating a TLSNotary instance configured with that proxy
     * 7. Initializing the WASM module
     *
     * @param options - Request options including target URL
     * @param confirmOptions - Options containing the confirmation callback
     * @param onStatus - Optional status callback for progress updates
     * @returns Object with TLSNotary instance, tokenId, and proxyUrl
     * @throws Error if user rejects the transaction
     *
     * @example
     * ```typescript
     * const service = new TLSNotaryService(demos);
     *
     * // Get a ready-to-use TLSNotary instance with user confirmation
     * const { tlsn, tokenId, proxyUrl } = await service.createTLSNotaryWithConfirmation(
     *   { targetUrl: 'https://api.github.com/users/octocat' },
     *   {
     *     onConfirm: async (details) => {
     *       // Show confirmation dialog to user in your UI
     *       return await showConfirmDialog({
     *         title: 'Confirm Attestation',
     *         message: `Burn ${details.amount} DEM for attestation?`,
     *         txHash: details.txHash,
     *       });
     *     }
     *   },
     *   (status) => console.log(status)
     * );
     *
     * // Perform attestation - the proxy is already configured!
     * const result = await tlsn.attest({
     *   url: 'https://api.github.com/users/octocat',
     * });
     * ```
     */
    async createTLSNotaryWithConfirmation(
        options: RequestAttestationOptions,
        confirmOptions: WithConfirmationOptions,
        onStatus?: StatusCallback,
    ): Promise<{ tlsn: TLSNotary; tokenId: string; proxyUrl: string; expiresAt: number }> {
        const status = onStatus || (() => {})

        // Step 1: Request attestation token with user confirmation
        status("Preparing attestation request...")
        const tokenResponse = await this.requestAttestationWithConfirmation(options, confirmOptions)

        status(`Token obtained: ${tokenResponse.tokenId}`)

        // Step 2: Get notary info from the node
        status("Getting notary configuration...")
        const notaryInfo = (await this.demos.nodeCall("tlsnotary.getInfo", {})) as {
            notaryUrl: string
            publicKey: string
        }

        if (!notaryInfo?.notaryUrl) {
            throw new Error("Failed to get notary info from node")
        }

        // Step 3: Create TLSNotary instance with the pre-obtained proxy URL
        status("Creating TLSNotary instance...")
        const tlsn = new TLSNotary({
            notaryUrl: notaryInfo.notaryUrl,
            websocketProxyUrl: tokenResponse.proxyUrl,
            notaryPublicKey: notaryInfo.publicKey,
        })

        // Step 4: Initialize WASM
        status("Initializing TLSNotary WASM...")
        await tlsn.initialize()

        status("TLSNotary ready for attestation!")

        return {
            tlsn,
            tokenId: tokenResponse.tokenId,
            proxyUrl: tokenResponse.proxyUrl,
            expiresAt: tokenResponse.expiresAt,
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
     * Store a TLSNotary proof on-chain or IPFS with user confirmation
     *
     * This method shows the transaction details to the user via the onConfirm callback
     * and only broadcasts if the user confirms. This is the recommended way to store
     * proofs in user-facing applications.
     *
     * @param tokenId - The attestation token ID
     * @param proof - The proof data (JSON string or serialized presentation)
     * @param options - Storage options (on-chain or IPFS)
     * @param confirmOptions - Options containing the confirmation callback
     * @returns Storage response with transaction hash and fee
     * @throws Error if user rejects the transaction
     *
     * @example
     * ```typescript
     * const { txHash, storageFee } = await service.storeProofWithConfirmation(
     *   tokenId,
     *   JSON.stringify(presentation),
     *   { storage: 'onchain' },
     *   {
     *     onConfirm: async (details) => {
     *       // Show confirmation dialog to user
     *       return await showConfirmDialog({
     *         title: 'Confirm Proof Storage',
     *         message: `This will burn ${details.amount} DEM to store the proof on-chain`,
     *         txHash: details.txHash,
     *       });
     *     }
     *   }
     * );
     * ```
     */
    async storeProofWithConfirmation(
        tokenId: string,
        proof: string,
        options: StoreProofOptions,
        confirmOptions: WithConfirmationOptions,
    ): Promise<StoreProofResponse> {
        const { storage } = options
        const { onConfirm } = confirmOptions

        // 1. Calculate storage fee
        const proofSizeKB = Math.ceil(proof.length / 1024)
        const storageFee = this.calculateStorageFee(proofSizeKB)

        // 2. Create the transaction (but don't broadcast yet)
        const tx = await this.createTlsnStoreTransaction(
            tokenId,
            proof,
            storage,
            storageFee,
        )

        // 3. Get confirmation from user
        const details: TransactionDetails = {
            transaction: tx,
            txHash: tx.hash,
            amount: storageFee,
            description: `Store TLSNotary proof ${storage === 'onchain' ? 'on-chain' : 'on IPFS'} (burns ${storageFee} DEM)`,
            tokenId,
        }

        const confirmed = await onConfirm(details)
        if (!confirmed) {
            throw new Error("Transaction rejected by user")
        }

        // 4. Confirm and broadcast
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
