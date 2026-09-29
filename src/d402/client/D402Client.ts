/**
 * D402Client - Client-side HTTP 402 payment protocol implementation
 *
 * Handles payment creation and settlement for 402 responses.
 */

import type { Demos } from '../../websdk/demosclass'
import type { Transaction } from '@/types'
import type { D402PaymentRequirement, D402SettlementResult } from './types'
import { uint8ArrayToHex } from '@/encryption/unifiedCrypto'
import * as skeletons from '../../websdk/utils/skeletons'
import { resolveNonce, sleep, validateEd25519Address } from '@/utils'

export class D402Client {
    private demos: Demos

    constructor(demos: Demos) {
        this.demos = demos
    }

    /**
     * Create a d402_payment transaction from 402 response requirements
     * @param requirement Payment requirements from 402 response
     * @returns Unsigned d402_payment transaction
     */
    async createPayment(
        requirement: D402PaymentRequirement,
        options?: { nonce?: number },
    ): Promise<Transaction> {
        if (!this.demos.keypair) {
            throw new Error('Wallet not connected')
        }

        // The payee is also the transaction's own recipient: sign() refuses a
        // transaction without one, so leaving it only inside `data` made
        // every payment built here unsignable. Checked before a nonce is
        // reserved, so a refused payment leaves no gap under auto-nonce.
        const recipient = requirement.recipient?.startsWith("0x")
            ? requirement.recipient
            : `0x${requirement.recipient ?? ""}`
        if (!validateEd25519Address(recipient)) {
            throw new Error(
                `d402 payment recipient must be a 32-byte hex address, got "${requirement.recipient}"`,
            )
        }

        // Get user's public key and nonce
        const { publicKey } = await this.demos.crypto.getIdentity('ed25519')
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await resolveNonce(
            options?.nonce,
            () => this.demos.getAddressNonce(publicKeyHex),
            this.demos._nonceReserver(publicKeyHex),
        )

        // Create transaction skeleton
        const tx = structuredClone(skeletons.transaction)

        // Build memo with resource ID
        const memo = requirement.description
            ? `resourceId:${requirement.resourceId} - ${requirement.description}`
            : `resourceId:${requirement.resourceId}`

        // Fill in transaction details
        tx.content.type = 'd402_payment'
        tx.content.to = recipient
        tx.content.nonce = nonce
        tx.content.timestamp = Date.now()
        tx.content.data = [
            'd402_payment',
            {
                to: requirement.recipient,
                amount: requirement.amount,
                memo: memo
            }
        ]

        return tx
    }

    /**
     * Sign, confirm and broadcast a d402_payment transaction, then wait for it
     * to be included.
     *
     * Goes through the node's `confirm` + broadcast path, the one every other
     * send uses. It used to call a `broadcastNativeTransaction` RPC the node
     * does not implement, so every settlement failed.
     *
     * @param payment Unsigned payment transaction from createPayment()
     * @param options.timeoutMs How long to wait for inclusion (default 60 s)
     * @returns `success` once the payment is in a block. If the wait runs out
     * first, `pending` is set with the hash: the payment may still land, so
     * resume with {@link waitForSettlement} instead of paying again.
     */
    async settle(
        payment: Transaction,
        options?: { timeoutMs?: number; pollIntervalMs?: number },
    ): Promise<D402SettlementResult> {
        let hash = ''
        try {
            const signedTx = await this.demos.sign(payment)
            hash = signedTx.hash
            const validity = await this.demos.confirm(signedTx)
            // The hash the node recalculated is the one it will index.
            hash = validity?.response?.data?.transaction?.hash || hash
            // A node that refuses the transaction answers 4xx without
            // throwing; waiting on it would report a refused payment as
            // pending. Anything else (a 5xx, a lost response) is ambiguous:
            // the payment may have been accepted, so it is checked by hash.
            const broadcast = await this.demos.broadcast(validity)
            const status = Number(broadcast?.result)
            if (status >= 400 && status < 500) {
                const reason = broadcast?.response?.message ?? broadcast?.response ?? broadcast?.extra
                return {
                    success: false,
                    hash,
                    message: `Broadcast refused (${broadcast?.result}): ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`,
                }
            }
        } catch (error: any) {
            return { success: false, hash, message: error?.message || 'Settlement error' }
        }
        return this.waitForSettlement(hash, options)
    }

    /**
     * Wait for a broadcast payment to be included.
     *
     * Reads the transaction back with `getTxByHash`, which every node
     * version serves; a node only returns it once it is in a block.
     *
     * @param hash The payment's transaction hash
     * @returns `success` when included and confirmed, a failure when
     * included as failed, and `pending` if not seen before the timeout.
     */
    async waitForSettlement(
        hash: string,
        options?: { timeoutMs?: number; pollIntervalMs?: number },
    ): Promise<D402SettlementResult> {
        const timeoutMs = options?.timeoutMs ?? 60_000
        const pollIntervalMs = options?.pollIntervalMs ?? 1_000
        const deadline = Date.now() + timeoutMs
        for (let first = true; first || Date.now() < deadline; first = false) {
            if (!first) await sleep(pollIntervalMs)
            let tx: any
            try {
                tx = await this.demos.getTxByHash(hash)
            } catch {
                continue
            }
            // Only this transaction, stored in a block, counts. A transport
            // failure comes back as an error object rather than a throw, and
            // must not pass for an included payment.
            const sameHash =
                typeof tx?.hash === 'string' &&
                tx.hash.replace(/^0x/i, '').toLowerCase() === hash.replace(/^0x/i, '').toLowerCase()
            if (!sameHash || typeof tx.blockNumber !== 'number') continue
            const blockNumber = tx.blockNumber
            if (String(tx.status) === 'failed') {
                return { success: false, hash, blockNumber, message: 'Payment transaction failed on chain' }
            }
            return { success: true, hash, blockNumber }
        }
        return {
            success: false,
            pending: true,
            hash,
            message: 'Payment broadcast but not yet included; resume with waitForSettlement',
        }
    }

    /**
     * Complete payment flow for a 402 response
     * Handles payment creation, settlement, and retry with payment proof
     *
     * @param requirement Payment requirements from 402 response
     * @param url Original URL that returned 402
     * @param requestInit Original fetch options
     * @returns Final response after payment
     *
     * @example
     * ```typescript
     * const response = await fetch('/premium')
     * if (response.status === 402) {
     *   const requirement = await response.json()
     *   const finalResponse = await d402.handlePaymentRequired(
     *     requirement,
     *     '/premium',
     *     { method: 'GET' }
     *   )
     * }
     * ```
     */
    async handlePaymentRequired(
        requirement: D402PaymentRequirement,
        url: string,
        requestInit?: RequestInit
    ): Promise<Response> {
        // Create payment
        const payment = await this.createPayment(requirement)

        // Settle payment
        const result = await this.settle(payment)

        if (!result.success) {
            // A pending payment may still land: surface its hash so the
            // caller waits on it instead of paying a second time.
            throw new Error(
                result.pending
                    ? `Payment pending (${result.hash}): ${result.message}`
                    : `Payment failed: ${result.message}`,
            )
        }

        // Retry original request with payment proof header
        const headers = new Headers(requestInit?.headers || {})
        headers.set('X-Payment-Proof', result.hash)

        const retryResponse = await fetch(url, {
            ...requestInit,
            headers: headers
        })

        return retryResponse
    }
}
