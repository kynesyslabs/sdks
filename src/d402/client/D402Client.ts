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

export class D402Client {
    private demos: Demos

    constructor(demos: Demos) {``
        this.demos = demos
    }

    /**
     * Create a d402_payment transaction from 402 response requirements
     * @param requirement Payment requirements from 402 response
     * @returns Unsigned d402_payment transaction
     */
    async createPayment(requirement: D402PaymentRequirement): Promise<Transaction> {
        if (!this.demos.keypair) {
            throw new Error('Wallet not connected')
        }

        // Get user's public key and nonce
        const { publicKey } = await this.demos.crypto.getIdentity('ed25519')
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await this.demos.getAddressNonce(publicKeyHex)

        // Create transaction skeleton
        const tx = structuredClone(skeletons.transaction)

        // Build memo with resource ID
        const memo = requirement.description
            ? `resourceId:${requirement.resourceId} - ${requirement.description}`
            : `resourceId:${requirement.resourceId}`

        // Fill in transaction details
        tx.content.type = 'd402_payment'
        tx.content.nonce = nonce + 1
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
     * Sign and broadcast a d402_payment transaction
     * @param payment Unsigned payment transaction from createPayment()
     * @returns Settlement result with transaction hash
     */
    async settle(payment: Transaction): Promise<D402SettlementResult> {
        try {
            // Sign the transaction
            const signedTx = await this.demos.sign(payment)

            // Broadcast to network via RPC
            const result = await this.demos.nodeCall('broadcastNativeTransaction', {
                transaction: signedTx
            })

            if (result.success) {
                return {
                    success: true,
                    hash: signedTx.hash,
                    blockNumber: result.blockNumber
                }
            } else {
                return {
                    success: false,
                    hash: signedTx.hash,
                    message: result.message || 'Settlement failed'
                }
            }
        } catch (error: any) {
            return {
                success: false,
                hash: '',
                message: error.message || 'Settlement error'
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
