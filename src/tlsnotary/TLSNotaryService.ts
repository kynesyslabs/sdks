/**
 * TLSNotary Service - Token-based Attestation Management
 *
 * This module provides functions for managing TLSNotary attestation tokens
 * and storing proofs on the Demos Network blockchain.
 *
 * The attestation flow:
 * 1. Submit a `tlsn_request` (burns 1 DEM) and wait until it is in a block;
 *    its hash is the token id, then a proxy is requested for it
 * 2. Attest through the proxy; the request carries `X-Demos-Bind`, which
 *    names the sender and the request hash, and is always revealed
 * 3. Store the proof on chain (burns 1 + ceil(size/1024) DEM)
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
 * // Request a token and a TLSNotary instance bound to it
 * const { tlsn, tokenId } = await service.createTLSNotary({
 *   targetUrl: 'https://api.github.com/users/octocat',
 *   purpose: 'store',
 * });
 * const result = await tlsn.attest({ url: 'https://api.github.com/users/octocat' });
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
import { OS_PER_DEM, osToDem } from "@/denomination"
import { TLSNotary } from "./TLSNotary"
import { calculateStorageFee, presentationByteLength } from "./helpers"
import { resolveNonce } from "@/utils"
import type { StatusCallback } from "./types"
import type { TLSNBindPurpose } from "./revealPolicy"
import {
    isTlsnVerifiedActive,
    reportedMaxPresentationBytes,
    resolveNotary,
} from "./network"

/**
 * Response from requestAttestation
 */
export interface AttestationTokenResponse {
    /** WebSocket proxy URL for this attestation */
    proxyUrl: string
    /**
     * Token ID for this attestation. On a network with `tlsnVerified` active
     * it is the hash of the included `tlsn_request`.
     */
    tokenId: string
    /** Unix timestamp when token expires */
    expiresAt: number
    /** Number of retry attempts remaining */
    retriesLeft: number
    /** Transaction hash of the attestation request */
    txHash: string
    /** The requesting address, `0x` + hex: the sender the bind header names. */
    owner: string
}

/**
 * Response from storeProof.
 *
 * P4: `storageFee` is now a `bigint` in OS (smallest-unit). Convert via
 * `denomination.osToDem(storageFee)` for display.
 */
export interface StoreProofResponse {
    /** Transaction hash of the storage transaction */
    txHash: string
    /** Total fee burned for storage as a `bigint` in OS. */
    storageFee: bigint
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
    nonce?: number
    /**
     * What the attestation is for, named in the `X-Demos-Bind` header: the
     * identity context it will be linked under, or `"store"` (default) for a
     * proof stored with `storeProof`. Nodes refuse a proof whose bind header
     * names another purpose.
     */
    purpose?: TLSNBindPurpose
    /** How long to wait for the `tlsn_request` to be included (default 60 s). */
    inclusionTimeoutMs?: number
    /** Delay between inclusion polls (default 1 s). */
    pollIntervalMs?: number
}

/**
 * Options for storing a proof
 */
export interface StoreProofOptions {
    /**
     * Storage location. Only `"onchain"`: nodes refuse IPFS storage of
     * TLSNotary proofs.
     */
    storage?: "onchain"
    nonce?: number
    /**
     * Largest presentation the network stores, in bytes. Defaults to what
     * the node reports in `tlsnotary.getInfo`, else the mainnet value.
     */
    maxPresentationBytes?: number
}

/**
 * Transaction details for user confirmation.
 *
 * P4: `amount` is the **OS** (smallest-unit) burn amount as a `bigint`.
 * Convert to DEM via `denomination.osToDem(amount)` for display.
 */
export interface TransactionDetails {
    /** The signed transaction object */
    transaction: any
    /** Transaction hash */
    txHash: string
    /** OS amount being burned/spent (`bigint`). */
    amount: bigint
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
     * This submits a TLSN_REQUEST native transaction that burns 1 DEM,
     * waits until it is in a block, and returns a token ID with a proxy URL
     * for performing the attestation. On a network with `tlsnVerified`
     * active the token ID is the request's transaction hash.
     *
     * @param options - Request options including target URL
     * @returns Attestation token response with proxyUrl and tokenId
     * @throws when the request is refused, fails, or is not included in time
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
        assertHttps(options.targetUrl)

        // Burns 1 DEM
        const tx = await this.createTlsnRequestTransaction(
            options.targetUrl,
            options.nonce,
        )
        return await this.submitRequest(tx, options)
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
        assertHttps(targetUrl)

        // 1. Create the transaction (but don't broadcast yet)
        const tx = await this.createTlsnRequestTransaction(
            targetUrl,
            options.nonce,
        )

        // 2. Get confirmation from user
        const details: TransactionDetails = {
            transaction: tx,
            txHash: tx.hash,
            amount: OS_PER_DEM, // 1 DEM expressed in OS
            description: "TLSNotary attestation request (burns 1 DEM)",
            targetUrl,
        }

        const confirmed = await onConfirm(details)
        if (!confirmed) {
            throw new Error("Transaction rejected by user")
        }

        return await this.submitRequest(tx, options)
    }

    /**
     * Broadcast a signed `tlsn_request`, wait until it is in a block, then
     * open a proxy for it.
     *
     * The proxy is only requested after inclusion: a node that admitted the
     * request to its mempool may not be the one serving the proxy, and on a
     * `tlsnVerified` network the token is the on-chain request itself, keyed
     * by its hash.
     */
    private async submitRequest(
        tx: Awaited<ReturnType<TLSNotaryService["createTlsnRequestTransaction"]>>,
        options: RequestAttestationOptions,
    ): Promise<AttestationTokenResponse> {
        const { targetUrl } = options
        const validity = await DemosTransactions.confirm(tx, this.demos)
        // The node indexes the transaction under the hash it recalculated.
        const txHash: string =
            validity?.response?.data?.transaction?.hash || tx.hash
        const broadcastResult = await DemosTransactions.broadcast(
            validity,
            this.demos,
        )
        if (broadcastResult.result !== 200) {
            throw new Error(
                `Failed to submit attestation request: ${broadcastResult.response?.message || "Unknown error"}`,
            )
        }

        await this.waitForInclusion(txHash, options)

        const tokenId = isTlsnVerifiedActive(await this.demos.getNetworkInfo())
            ? txHash
            : await this.legacyTokenId(txHash)

        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const owner = uint8ArrayToHex(publicKey as Uint8Array)

        const proxyResponse = (await this.demos.nodeCall("requestTLSNproxy", {
            tokenId,
            owner,
            targetUrl,
        })) as {
            websocketProxyUrl?: string
            expiresIn?: number
            retriesLeft?: number
            error?: string
            message?: string
        }

        if (!proxyResponse?.websocketProxyUrl) {
            throw new Error(
                `Failed to get proxy URL from node: ${proxyResponse?.message || proxyResponse?.error || "no proxy in response"}`,
            )
        }

        return {
            proxyUrl: proxyResponse.websocketProxyUrl,
            tokenId,
            expiresAt: Date.now() + (proxyResponse.expiresIn || 30000),
            retriesLeft: proxyResponse.retriesLeft ?? 3,
            txHash,
            owner,
        }
    }

    /**
     * Poll `getTransactionStatus` until the transaction is in a block.
     *
     * @throws when it is included as failed, or not seen before the timeout.
     */
    private async waitForInclusion(
        hash: string,
        options: { inclusionTimeoutMs?: number; pollIntervalMs?: number },
    ): Promise<number | undefined> {
        const timeoutMs = options.inclusionTimeoutMs ?? 60_000
        const pollIntervalMs = options.pollIntervalMs ?? 1_000
        const deadline = Date.now() + timeoutMs
        let lastState = "unknown"
        for (let first = true; first || Date.now() < deadline; first = false) {
            if (!first) await sleep(pollIntervalMs)
            const status = (await this.demos.call(
                "nodeCall",
                "getTransactionStatus",
                { hash },
            )) as { state?: unknown; blockNumber?: number; result?: number } | null
            const state = status && typeof status.state === "string" ? status.state : null
            if (!state) continue
            lastState = state
            if (state === "included") return status?.blockNumber
            if (state === "failed") {
                throw new Error(
                    `TLSNotary attestation request ${hash} was included as failed`,
                )
            }
        }
        throw new Error(
            `TLSNotary attestation request ${hash} not included after ${timeoutMs} ms (last state: ${lastState}); it may still land, check it before paying again`,
        )
    }

    /**
     * Token id on a network without `tlsnVerified`, where the node keeps the
     * token off chain under its own id.
     */
    private async legacyTokenId(txHash: string): Promise<string> {
        const attempts = 10
        for (let attempt = 0; attempt < attempts; attempt++) {
            const tokenResponse = (await this.demos.nodeCall("tlsnotary.getToken", {
                txHash,
            })) as { token?: { id: string } } | null
            if (tokenResponse?.token?.id) return tokenResponse.token.id
            if (attempt < attempts - 1) await sleep(1_000)
        }
        throw new Error(
            `Attestation request ${txHash} is included but the node reports no token for it`,
        )
    }

    /**
     * Request attestation token and create a pre-configured TLSNotary instance
     *
     * This is the recommended way to perform attestations. It handles:
     * 1. Resolving the notary (pinned on mainnet, from the node elsewhere)
     * 2. Creating and broadcasting the TLSN_REQUEST transaction
     * 3. Waiting until it is in a block
     * 4. Getting the proxy URL for that token
     * 5. Creating a TLSNotary instance configured with that proxy, trusting
     *    only the resolved notary keys, and binding its requests to the
     *    sender and the request hash (`X-Demos-Bind`, purpose from
     *    `options.purpose`)
     * 6. Initializing the WASM module
     *
     * The returned TLSNotary instance is ready to call `attest()` immediately.
     * For an identity link pass the context as `purpose` (e.g. `"github"`);
     * the default `"store"` binds the proof to `storeProof`.
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
     *   targetUrl: 'https://api.github.com/users/octocat',
     *   purpose: 'store',
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
    ): Promise<{ tlsn: TLSNotary; tokenId: string; proxyUrl: string; expiresAt: number; requestTxHash: string }> {
        const status = onStatus || (() => {})

        // Resolved before paying, so a network without a usable notary
        // costs nothing.
        status("Getting notary configuration...")
        const notary = await resolveNotary(this.demos)

        status("Requesting attestation token...")
        const tokenResponse = await this.requestAttestation(options)

        status(`Token obtained: ${tokenResponse.tokenId}`)

        status("Creating TLSNotary instance...")
        const tlsn = this.boundTLSNotary(notary, tokenResponse, options)

        status("Initializing TLSNotary WASM...")
        await tlsn.initialize()

        status("TLSNotary ready for attestation!")

        return {
            tlsn,
            tokenId: tokenResponse.tokenId,
            proxyUrl: tokenResponse.proxyUrl,
            expiresAt: tokenResponse.expiresAt,
            requestTxHash: tokenResponse.txHash,
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
     * 4. Waiting until it is in a block
     * 5. Getting the proxy URL
     * 6. Creating a TLSNotary instance configured with that proxy and bound
     *    to the sender and the request hash, as `createTLSNotary` does
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
    ): Promise<{ tlsn: TLSNotary; tokenId: string; proxyUrl: string; expiresAt: number; requestTxHash: string }> {
        const status = onStatus || (() => {})

        status("Getting notary configuration...")
        const notary = await resolveNotary(this.demos)

        status("Preparing attestation request...")
        const tokenResponse = await this.requestAttestationWithConfirmation(options, confirmOptions)

        status(`Token obtained: ${tokenResponse.tokenId}`)

        status("Creating TLSNotary instance...")
        const tlsn = this.boundTLSNotary(notary, tokenResponse, options)

        status("Initializing TLSNotary WASM...")
        await tlsn.initialize()

        status("TLSNotary ready for attestation!")

        return {
            tlsn,
            tokenId: tokenResponse.tokenId,
            proxyUrl: tokenResponse.proxyUrl,
            expiresAt: tokenResponse.expiresAt,
            requestTxHash: tokenResponse.txHash,
        }
    }

    /**
     * A TLSNotary instance that attests through the proxy opened for this
     * token, trusts only the resolved notary keys and binds every request to
     * the token's sender and `tlsn_request`.
     *
     * Only websocketProxyUrl is set, not rpcUrl, so the instance uses this
     * proxy instead of requesting one of its own.
     */
    private boundTLSNotary(
        notary: Awaited<ReturnType<typeof resolveNotary>>,
        token: AttestationTokenResponse,
        options: RequestAttestationOptions,
    ): TLSNotary {
        return new TLSNotary({
            notaryUrl: notary.notaryUrl,
            websocketProxyUrl: token.proxyUrl,
            trustedNotaryKeys: notary.trustedNotaryKeys,
            binding: {
                purpose: options.purpose ?? "store",
                sender: token.owner,
                requestTxHash: token.txHash,
            },
        })
    }

    /**
     * Refuse a store the network would refuse, before any fee is signed:
     * anything but on-chain storage, or a presentation over the network's
     * size limit.
     */
    private async checkStorable(proof: string, options: StoreProofOptions): Promise<void> {
        const storage: string = options?.storage ?? "onchain"
        if (storage !== "onchain") {
            throw new Error(
                `TLSNotary proofs are stored on chain only, got storage ${JSON.stringify(storage)}`,
            )
        }
        const limit = options.maxPresentationBytes ?? (await this.maxPresentationBytes())
        const size = presentationByteLength(proof)
        if (size > limit) {
            throw new Error(
                `TLSNotary presentation is ${size} bytes, over the network limit of ${limit} bytes`,
            )
        }
    }

    /** The node's presentation size limit, or the mainnet value when it reports none. */
    private async maxPresentationBytes(): Promise<number> {
        let info: unknown = null
        try {
            info = await this.demos.nodeCall("tlsnotary.getInfo", {})
        } catch {
            info = null
        }
        return reportedMaxPresentationBytes(info)
    }

    /**
     * Store a TLSNotary proof on chain
     *
     * This submits a TLSN_STORE native transaction that burns:
     * - 1 DEM base fee
     * - 1 DEM per KB of proof data
     *
     * @param tokenId - The attestation token ID
     * @param proof - The proof data (JSON string or serialized presentation)
     * @param options - Storage options; only on-chain storage is accepted
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
        await this.checkStorable(proof, options)
        const storage = "onchain"

        // 1. Calculate storage fee
        const proofSizeKB = Math.ceil(proof.length / 1024)
        const storageFee = this.calculateStorageFee(proofSizeKB)

        // 2. Create and submit TLSN_STORE native transaction
        const tx = await this.createTlsnStoreTransaction(
            tokenId,
            proof,
            storage,
            storageFee,
            options.nonce,
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
     * Store a TLSNotary proof on chain with user confirmation
     *
     * This method shows the transaction details to the user via the onConfirm callback
     * and only broadcasts if the user confirms. This is the recommended way to store
     * proofs in user-facing applications.
     *
     * @param tokenId - The attestation token ID
     * @param proof - The proof data (JSON string or serialized presentation)
     * @param options - Storage options; only on-chain storage is accepted
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
        const { onConfirm } = confirmOptions
        await this.checkStorable(proof, options)
        const storage = "onchain"

        // 1. Calculate storage fee
        const proofSizeKB = Math.ceil(proof.length / 1024)
        const storageFee = this.calculateStorageFee(proofSizeKB)

        // 2. Create the transaction (but don't broadcast yet)
        const tx = await this.createTlsnStoreTransaction(
            tokenId,
            proof,
            storage,
            storageFee,
            options.nonce,
        )

        // 3. Get confirmation from user
        const details: TransactionDetails = {
            transaction: tx,
            txHash: tx.hash,
            amount: storageFee,
            description: `Store TLSNotary proof on-chain (burns ${osToDem(storageFee)} DEM)`,
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
    calculateStorageFee(proofSizeKB: number): bigint {
        // Delegates to the standalone helper so the bigint OS arithmetic
        // is the single source of truth.
        return calculateStorageFee(proofSizeKB)
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
    private async createTlsnRequestTransaction(
        targetUrl: string,
        customNonce?: number,
    ) {
        const tx = DemosTransactions.empty()

        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await resolveNonce(customNonce, () =>
            this.demos.getAddressNonce(publicKeyHex),
        )

        // Self-directed transaction (burns tokens). Pre-fork wire format:
        // 1 DEM as JS number. The serializerGate (P4 commit 2) will
        // re-encode to OS string when talking to a post-fork node.
        tx.content.to = publicKeyHex
        tx.content.nonce = nonce
        tx.content.amount = 1 // 1 DEM fee for attestation request (legacy wire shape)
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
     * Create a TLSN_STORE native transaction.
     *
     * `fee` is the bigint OS storage fee (from `calculateStorageFee`).
     * Internally we coerce to a DEM `number` for the legacy wire shape;
     * the serializerGate (P4 commit 2) handles post-fork OS-string
     * encoding when applicable.
     * @internal
     */
    private async createTlsnStoreTransaction(
        tokenId: string,
        proof: string,
        storageType: "onchain",
        fee: bigint,
        customNonce?: number,
    ) {
        const tx = DemosTransactions.empty()

        const { publicKey } = await this.demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await resolveNonce(customNonce, () =>
            this.demos.getAddressNonce(publicKeyHex),
        )

        // Pre-fork wire shape: DEM as JS number. Convert OS fee to DEM
        // assuming the fee is a whole multiple of OS_PER_DEM (true for
        // calculateStorageFee). Post-fork serializer will re-encode.
        const feeDem = Number(fee / OS_PER_DEM)

        // Self-directed transaction (burns tokens)
        tx.content.to = publicKeyHex
        tx.content.nonce = nonce
        tx.content.amount = feeDem // Storage fee in DEM (legacy wire shape)
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

function assertHttps(targetUrl: string): void {
    if (new URL(targetUrl).protocol !== "https:") {
        throw new Error("Only HTTPS URLs are supported for TLS attestation")
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default TLSNotaryService
