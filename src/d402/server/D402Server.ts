/**
 * D402Server - Server-side HTTP 402 payment protocol implementation
 *
 * Handles payment verification and content gating for Demos Network applications.
 */

import type {
    D402ServerConfig,
    D402PaymentRequirement,
    D402VerificationResult,
    CachedPayment
} from './types'
import { demToOs, parseOsString } from '@/denomination'

/**
 * Normalise a D402 dual-shape amount carrier to OS `bigint`.
 *
 * The carrier widened in P4 to `number | string` so a single requirement
 * object can be served by both pre-fork (DEM `number`) and post-fork
 * (OS decimal `string`) nodes. Naïve `<` comparison on this union is
 * unsafe: string-vs-string is lexicographic ("5000000000" < "5" === true)
 * and number/string mixes coerce through `Number(...)` which loses
 * precision above 2^53. Both failure modes can wrongly accept
 * underpayment or reject valid payment.
 *
 * - `number` input: treated as DEM (legacy wire) and converted to OS
 *   via `demToOs`. Negative or non-finite numbers throw.
 * - `string` input: treated as a canonical OS decimal-integer string
 *   and parsed via `parseOsString`. Non-canonical strings (whitespace,
 *   leading zeros, signed prefix) throw.
 *
 * The throw is intentional — D402 amount fields cross a trust boundary
 * (the requirement set by the merchant, the verified amount returned
 * by the node) and a malformed value is a configuration error, not a
 * silent default.
 *
 * @internal exported for tests; not part of the public D402 API.
 */
export function _normalizeD402AmountToOsBigint(
    value: number | string | bigint,
): bigint {
    if (typeof value === 'bigint') {
        if (value < 0n) {
            throw new Error(
                `[D402Server] amount must be non-negative, got ${value}`,
            )
        }
        return value
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(
                `[D402Server] amount must be a non-negative finite number, got ${value}`,
            )
        }
        // demToOs accepts integer or fractional DEM; for D402 a fractional
        // DEM number is valid (the legacy wire allowed sub-DEM numerics
        // in some indexer paths) so we don't add an extra is-integer guard
        // here.
        return demToOs(value)
    }
    if (typeof value === 'string') {
        return parseOsString(value)
    }
    throw new Error(
        `[D402Server] amount must be number | string | bigint, got ${typeof value}`,
    )
}

export class D402Server {
    private rpcUrl: string
    private cacheTTL: number
    private paymentCache: Map<string, CachedPayment>

    constructor(config: D402ServerConfig) {
        this.rpcUrl = config.rpcUrl
        this.cacheTTL = config.cacheTTL || 300 // Default 5 minutes
        this.paymentCache = new Map()
    }

    /**
     * Verify a payment transaction via RPC
     * @param txHash Transaction hash from X-Payment-Proof header
     * @returns Verification result with payment details
     */
    async verify(txHash: string): Promise<D402VerificationResult> {
        // Check cache first
        const cached = this.paymentCache.get(txHash)
        if (cached && Date.now() < cached.expiresAt) {
            return {
                valid: true,
                verified_from: cached.from,
                verified_to: cached.to,
                verified_amount: cached.amount,
                verified_memo: cached.memo,
                timestamp: cached.timestamp
            }
        }

        // Fetch transaction from RPC
        // Note: We need to get the full transaction, not just verify
        // The /d402/verify endpoint expects a full transaction object
        // So we'll fetch the transaction first, then verify it

        try {
            const txResponse = await fetch(`${this.rpcUrl}/getTransaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hash: txHash })
            })

            if (!txResponse.ok) {
                return {
                    valid: false,
                    timestamp: Date.now()
                }
            }

            const tx = await txResponse.json()

            // Verify the transaction
            const verifyResponse = await fetch(`${this.rpcUrl}/d402/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction: tx })
            })

            if (!verifyResponse.ok) {
                return {
                    valid: false,
                    timestamp: Date.now()
                }
            }

            const verification = await verifyResponse.json()

            if (verification.valid) {
                // Extract payment details from transaction
                const paymentData = tx.content.data[1]
                const memo = paymentData.memo || ''

                // Cache the verified payment
                const cachedPayment: CachedPayment = {
                    txHash,
                    from: verification.verified_from,
                    to: verification.verified_to,
                    amount: verification.verified_amount,
                    memo,
                    timestamp: verification.timestamp,
                    expiresAt: Date.now() + (this.cacheTTL * 1000)
                }
                this.paymentCache.set(txHash, cachedPayment)

                return {
                    valid: true,
                    verified_from: verification.verified_from,
                    verified_to: verification.verified_to,
                    verified_amount: verification.verified_amount,
                    verified_memo: memo,
                    timestamp: verification.timestamp
                }
            }

            return {
                valid: false,
                timestamp: Date.now()
            }

        } catch (error) {
            console.error('D402Server: Verification error:', error)
            return {
                valid: false,
                timestamp: Date.now()
            }
        }
    }

    /**
     * Generate HTTP 402 Payment Required response data
     * @param requirement Payment requirements
     * @returns 402 response object
     */
    require(requirement: D402PaymentRequirement): {
        status: 402
        body: D402PaymentRequirement
    } {
        return {
            status: 402,
            body: requirement
        }
    }

    /**
     * Validate that a payment matches the requirements
     * @param verification Verification result from verify()
     * @param requirement Original payment requirements
     * @returns True if payment is valid for the resource
     */
    validatePayment(
        verification: D402VerificationResult,
        requirement: D402PaymentRequirement
    ): boolean {
        if (!verification.valid) {
            return false
        }

        // Check recipient matches
        if (verification.verified_to !== requirement.recipient) {
            return false
        }

        // Check amount matches (or exceeds). BigInt-normalise both sides
        // so the dual-shape (number DEM | string OS) carrier works
        // correctly: lexicographic string compare and Number() coercion
        // both produce wrong answers on real-world OS magnitudes.
        // A malformed amount here is a configuration / RPC-corruption
        // bug — fail closed and return false rather than throwing the
        // exception across the middleware.
        try {
            const verifiedOs = _normalizeD402AmountToOsBigint(
                verification.verified_amount as number | string | bigint,
            )
            const requiredOs = _normalizeD402AmountToOsBigint(
                requirement.amount as number | string | bigint,
            )
            if (verifiedOs < requiredOs) {
                return false
            }
        } catch (err) {
            console.error('[D402Server] amount comparison failed:', err)
            return false
        }

        // Check resource ID in memo (format: "resourceId:xyz")
        const memo = verification.verified_memo || ''
        const expectedMemoPrefix = `resourceId:${requirement.resourceId}`

        if (!memo.startsWith(expectedMemoPrefix)) {
            return false
        }

        return true
    }

    /**
     * Clear expired entries from payment cache
     */
    private cleanCache(): void {
        const now = Date.now()
        for (const [hash, payment] of this.paymentCache.entries()) {
            if (now >= payment.expiresAt) {
                this.paymentCache.delete(hash)
            }
        }
    }

    /**
     * Manually clear the entire payment cache
     */
    clearCache(): void {
        this.paymentCache.clear()
    }
}
