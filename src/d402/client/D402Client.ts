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
import { resolveNonce } from '@/utils'

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

        // Get user's public key and nonce
        const { publicKey } = await this.demos.crypto.getIdentity('ed25519')
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await resolveNonce(
            options?.nonce,
            () => this.demos.getAddressNonce(publicKeyHex),
            this.demos._nonceReserver(publicKeyHex),
        )

        // The payee is also the transaction's own recipient. sign() refuses a
        // transaction without one, so leaving it only inside `data` made
        // every payment built here unsignable.
        const recipient = requirement.recipient?.startsWith("0x")
            ? requirement.recipient
            : `0x${requirement.recipient ?? ""}`
        if (!/^0x[0-9a-f]{64}$/i.test(recipient)) {
            throw new Error(
                `d402 payment recipient must be a 32-byte hex address, got "${requirement.recipient}"`,
            )
        }

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
     * Sign, confirm, broadcast and wait for a d402_payment transaction.
     *
     * Goes through the node's `confirm` + broadcast path, the one every other
     * send uses. It used to call a `broadcastNativeTransaction` RPC the node
     * does not implement, so every settlement failed.
     *
     * @param payment Unsigned payment transaction from createPayment()
     * @param options.timeoutMs How long to wait for inclusion (default 60 s)
     * @returns Success only once the payment is included, with its hash and
     * block number
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
            const result = await this.demos.broadcastAndWait(validity, {
                timeoutMs: options?.timeoutMs,
                pollIntervalMs: options?.pollIntervalMs,
            })
            hash = result.hash || hash
            if (result.status.state === 'included') {
                return { success: true, hash, blockNumber: result.status.blockNumber }
            }
            return {
                success: false,
                hash,
                blockNumber: result.status.blockNumber,
                message: 'Payment transaction failed on chain',
            }
        } catch (error: any) {
            return {
                success: false,
                hash,
                message: error?.message || 'Settlement error',
            }
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
            throw new Error(`Payment failed: ${result.message}`)
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
