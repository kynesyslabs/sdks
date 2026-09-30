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
import { normalizeHexAddress } from '@/utils'
import { d402Memo } from '../memo'

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

        try {
            const tx = await this.fetchStoredTx(txHash)
            const payment = tx ? paymentFromStoredTx(tx, txHash) : null
            if (!payment) {
                return { valid: false, timestamp: Date.now() }
            }

            const timestamp = Date.now()
            this.paymentCache.set(txHash, {
                txHash,
                ...payment,
                timestamp,
                expiresAt: timestamp + (this.cacheTTL * 1000)
            })

            return {
                valid: true,
                verified_from: payment.from,
                verified_to: payment.to,
                verified_amount: payment.amount,
                verified_memo: payment.memo,
                timestamp
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
     * Read a transaction back from the node with the `getTxByHash` nodeCall,
     * the lookup every node release serves. The node answers only once the
     * transaction is stored in a block; anything else comes back as an
     * error or the string "error".
     */
    private async fetchStoredTx(txHash: string): Promise<any> {
        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'nodeCall',
                params: [
                    {
                        type: 'nodeCall',
                        message: 'getTxByHash',
                        sender: null,
                        receiver: null,
                        timestamp: null,
                        data: { hash: txHash },
                        extra: '',
                        muid: randomMuid()
                    }
                ]
            })
        })
        if (!response.ok) {
            return null
        }
        const reply = await response.json()
        if (Number(reply?.result) !== 200) {
            return null
        }
        return reply.response
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

        // Check recipient matches. Only the requirement is spelled
        // canonically (a merchant may write it without `0x` or in upper
        // case); the credited account must equal that spelling exactly,
        // because the node keys balances by the exact string and an
        // upper-case credit lands in a different account.
        if (
            !verification.verified_to ||
            typeof requirement.recipient !== 'string' ||
            verification.verified_to !== normalizeHexAddress(requirement.recipient)
        ) {
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

        // Check the payer when the caller pinned one. The proof is a public
        // transaction hash, so an unpinned requirement is a bearer token:
        // whoever repeats the hash gets the access that was paid for.
        // Compared case-insensitively: both sides are hex addresses and the
        // node does not promise a casing, so a requirement written in upper
        // case would otherwise turn away the very payer it pinned.
        if (
            requirement.payer &&
            verification.verified_from?.toLowerCase() !==
                requirement.payer.toLowerCase()
        ) {
            return false
        }

        // Check the resource the payment names.
        const memo = verification.verified_memo || ''

        if (!memoNamesResource(memo, requirement.resourceId, requirement.description)) {
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

/**
 * Does this memo name exactly this resource?
 *
 * The memo is `resourceId:<id>`, optionally followed by ` - <description>`
 * (see `D402Client.createPayment`). Only the two memos the client builds for
 * this requirement are accepted. Taking any ` - ` suffix as a description
 * matched a prefix, not the id: a payment for `a - b` (an id that itself
 * contains ` - `) or for `user-12` could unlock `a` or `user-1`.
 */
export function memoNamesResource(
    memo: string,
    resourceId: string,
    description?: string,
): boolean {
    return (
        memo === d402Memo(resourceId) ||
        (!!description && memo === d402Memo(resourceId, description))
    )
}

/**
 * The payment a stored transaction makes, or null when it is not a d402
 * payment that landed: another transaction's answer, a failed or unmined
 * transaction, or one of another type proves nothing.
 *
 * The credited account and amount are read from the balance credit the node
 * applied, and must agree with the signed payload the memo comes from.
 */
function paymentFromStoredTx(
    tx: any,
    txHash: string,
): { from: string; to: string; amount: number | string; memo: string } | null {
    if (!tx || typeof tx !== 'object') return null
    const sameHash =
        typeof tx.hash === 'string' &&
        tx.hash.replace(/^0x/i, '').toLowerCase() ===
            txHash.replace(/^0x/i, '').toLowerCase()
    if (!sameHash || typeof tx.blockNumber !== 'number') return null
    if (String(tx.status) !== 'confirmed') return null

    const content = tx.content
    if (content?.type !== 'd402_payment') return null
    const data = Array.isArray(content.data) ? content.data : []
    const payload = data[0] === 'd402_payment' ? data[1] : null
    if (!payload || typeof payload.to !== 'string') return null

    const from = content.from_ed25519_address ?? content.from
    if (typeof from !== 'string' || !from) return null

    const credit = Array.isArray(content.gcr_edits)
        ? content.gcr_edits.find(
              (e: any) => e?.type === 'balance' && e?.operation === 'add',
          )
        : undefined
    // No credit, no payment: a stored transaction is not proof that the
    // payee was paid unless the node's balance credit is on it.
    if (!credit || typeof credit.account !== 'string') return null
    const to = credit.account
    const amount = credit.amount
    if (typeof amount !== 'number' && typeof amount !== 'string') {
        return null
    }

    // The credit is what moved; the payload is what was signed. They are
    // compared exactly, as the node keys the credit by the payload's string.
    if (to !== payload.to) return null
    try {
        if (
            _normalizeD402AmountToOsBigint(amount) !==
            _normalizeD402AmountToOsBigint(payload.amount)
        ) {
            return null
        }
    } catch {
        return null
    }

    return {
        from,
        to,
        amount,
        memo: typeof payload.memo === 'string' ? payload.memo : '',
    }
}

function randomMuid(): string {
    return globalThis.crypto.randomUUID()
}
