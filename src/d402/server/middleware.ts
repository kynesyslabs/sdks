/**
 * D402 Express Middleware
 * Express-compatible middleware for HTTP 402 payment gating
 */

import { D402Server } from './D402Server'
import type { D402PaymentRequirement } from './types'

/**
 * Middleware configuration options
 */
export interface D402MiddlewareOptions {
    /** Payment amount in smallest unit */
    amount: number
    /** Resource identifier (included in memo validation) */
    resourceId: string
    /** Demos Network RPC URL */
    rpcUrl: string
    /** Merchant/recipient address (if not provided, must be in req.d402Recipient) */
    recipient?: string
    /** Optional payment description */
    description?: string
    /** Payment cache TTL in seconds (default: 300) */
    cacheTTL?: number
}

/**
 * Express Request with D402 extensions
 */
export interface D402Request {
    /** Merchant address (can be set dynamically per request) */
    d402Recipient?: string
    /** Verified payment details (available after middleware passes) */
    d402Payment?: {
        from: string
        to: string
        amount: number
        txHash: string
    }
}

/**
 * Create Express middleware for D402 payment gating
 *
 * @example
 * ```typescript
 * app.get('/premium-article',
 *   d402Required({
 *     amount: 5000000000000000000, // 5 DEM in smallest unit
 *     resourceId: 'article-123',
 *     rpcUrl: 'https://node2.demos.sh',
 *     recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
 *   }),
 *   (req, res) => {
 *     res.json({ article: "Premium content" })
 *   }
 * )
 * ```
 */
export function d402Required(options: D402MiddlewareOptions) {
    const server = new D402Server({
        rpcUrl: options.rpcUrl,
        cacheTTL: options.cacheTTL
    })

    return async (req: any, res: any, next: any) => {
        try {
            // Get payment proof from header
            const paymentProof = req.headers['x-payment-proof']

            // Determine recipient address
            const recipient = options.recipient || req.d402Recipient

            if (!recipient) {
                return res.status(500).json({
                    error: 'Server misconfiguration: recipient address not provided'
                })
            }

            // If no payment proof, return 402 with requirements
            if (!paymentProof) {
                const requirement: D402PaymentRequirement = {
                    amount: options.amount,
                    recipient: recipient,
                    resourceId: options.resourceId,
                    description: options.description
                }

                const response = server.require(requirement)
                return res.status(response.status).json(response.body)
            }

            // Verify payment
            const verification = await server.verify(paymentProof)

            if (!verification.valid) {
                return res.status(403).json({
                    error: 'Invalid payment proof'
                })
            }

            // Validate payment matches requirements
            const requirement: D402PaymentRequirement = {
                amount: options.amount,
                recipient: recipient,
                resourceId: options.resourceId,
                description: options.description
            }

            const isValid = server.validatePayment(verification, requirement)

            if (!isValid) {
                return res.status(403).json({
                    error: 'Payment does not match requirements',
                    details: {
                        expected_recipient: recipient,
                        expected_amount: options.amount,
                        expected_resource: `resourceId:${options.resourceId}`
                    }
                })
            }

            // Attach payment details to request for downstream handlers
            req.d402Payment = {
                from: verification.verified_from,
                to: verification.verified_to,
                amount: verification.verified_amount,
                txHash: paymentProof
            }

            // Payment valid, proceed
            next()

        } catch (error) {
            console.error('D402 middleware error:', error)
            return res.status(500).json({
                error: 'Payment verification failed'
            })
        }
    }
}
