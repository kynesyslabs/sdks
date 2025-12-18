/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { Transaction, GCREdit } from "@/types"
import { Demos } from "@/websdk"
import { Hashing } from "@/encryption/Hashing"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"
import * as skeletons from "@/websdk/utils/skeletons"
import { sha256 } from "@/websdk/utils/sha256"

/**
 * High-level API for creating escrow transactions
 * Enables trustless sending of DEM to unclaimed social identities
 */
export class EscrowTransaction {
    /**
     * Computes deterministic escrow address from platform:username
     * MUST MATCH the node implementation!
     *
     * @param platform - Social platform ("twitter", "github", "telegram")
     * @param username - Username on that platform (e.g., "@bob")
     * @returns Hex-encoded escrow address
     */
    static getEscrowAddress(platform: string, username: string): string {
        // Normalize to lowercase for case-insensitivity
        const identity = `${platform}:${username}`.toLowerCase()
        // Use SHA3-256 for deterministic address generation
        return Hashing.sha3_256(identity)
    }

    /**
     * Creates a transaction to send DEM to a social identity escrow
     *
     * @example
     * ```typescript
     * const tx = await EscrowTransaction.sendToIdentity(
     *   demos,
     *   "twitter",
     *   "@bob",
     *   100,
     *   { expiryDays: 30, message: "Welcome to Demos!" }
     * )
     * await demos.submitTransaction(tx)
     * ```
     *
     * @param demos - Demos SDK instance (must have keypair set)
     * @param platform - Social platform ("twitter", "github", "telegram")
     * @param username - Username on that platform
     * @param amount - Amount of DEM to send (number)
     * @param options - Optional parameters
     * @returns Signed transaction ready to submit
     */
    static async sendToIdentity(
        demos: Demos,
        platform: "twitter" | "github" | "telegram",
        username: string,
        amount: number,
        options?: {
            expiryDays?: number  // Default: 30 days
            message?: string     // Optional memo
        }
    ): Promise<Transaction> {
        // Get sender address from demos instance
        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const sender = uint8ArrayToHex(publicKey as Uint8Array)

        // Compute escrow address
        const escrowAddress = this.getEscrowAddress(platform, username)

        // Get nonce
        const nonce = await demos.getAddressNonce(sender)

        // Create empty transaction
        let tx = structuredClone(skeletons.transaction)

        // Build GCREdits
        const gcrEdits: GCREdit[] = [
            // 1. Deduct from sender's balance
            {
                type: "balance",
                operation: "remove",
                account: sender,
                amount: amount,
                txhash: "",
                isRollback: false,
            },

            // 2. Deposit to escrow
            {
                type: "escrow",
                operation: "deposit",
                account: escrowAddress,
                data: {
                    sender,
                    platform,
                    username,
                    amount: amount,
                    expiryDays: options?.expiryDays || 30,
                    message: options?.message,
                },
                txhash: "",
                isRollback: false,
            },
        ]

        // Fill transaction content
        tx.content.from = sender
        tx.content.to = escrowAddress
        tx.content.nonce = nonce + 1
        tx.content.amount = amount
        tx.content.type = "escrow"
        tx.content.timestamp = Date.now()
        tx.content.gcr_edits = gcrEdits
        tx.content.data = [
            "escrow",
            {
                platform,
                username,
                amount: amount.toString(),
                operation: "deposit",
            },
        ]

        // Sign transaction
        return await demos.sign(tx)
    }

    /**
     * Creates a transaction to claim escrowed funds
     *
     * Prerequisites:
     * - Claimant must have already proven ownership of the social identity
     *   (via Web2 identity linking transaction)
     *
     * @example
     * ```typescript
     * // Bob links Twitter first
     * await demos.Web2.linkTwitter("@bob")
     *
     * // Then claims escrow
     * const tx = await EscrowTransaction.claimEscrow(
     *   demos,
     *   "twitter",
     *   "@bob"
     * )
     * await demos.submitTransaction(tx)
     * ```
     *
     * @param demos - Demos SDK instance (must have keypair set)
     * @param platform - Social platform
     * @param username - Username to claim for
     * @returns Signed transaction ready to submit
     */
    static async claimEscrow(
        demos: Demos,
        platform: "twitter" | "github" | "telegram",
        username: string
    ): Promise<Transaction> {
        // Get claimant address from demos instance
        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const claimant = uint8ArrayToHex(publicKey as Uint8Array)

        // Compute escrow address
        const escrowAddress = this.getEscrowAddress(platform, username)

        // Get nonce
        const nonce = await demos.getAddressNonce(claimant)

        // Create empty transaction
        let tx = structuredClone(skeletons.transaction)

        // Build GCREdits
        const gcrEdits: GCREdit[] = [
            // 1. Claim escrow (includes identity verification on node side)
            {
                type: "escrow",
                operation: "claim",
                account: escrowAddress,
                data: {
                    claimant,
                    platform,
                    username,
                },
                txhash: "",
                isRollback: false,
            },

            // 2. Add to claimant's balance
            // Note: Amount will be determined during escrow claim validation by consensus
            {
                type: "balance",
                operation: "add",
                account: claimant,
                amount: 0, // Placeholder - filled by node during validation
                txhash: "",
                isRollback: false,
            },
        ]

        // Fill transaction content
        tx.content.from = claimant
        tx.content.to = escrowAddress
        tx.content.nonce = nonce + 1
        tx.content.amount = 0  // Amount filled by node
        tx.content.type = "escrow"
        tx.content.timestamp = Date.now()
        tx.content.gcr_edits = gcrEdits
        tx.content.data = [
            "escrow",
            {
                platform,
                username,
                operation: "claim",
            },
        ]

        // Sign transaction
        return await demos.sign(tx)
    }

    /**
     * Creates a transaction to refund an expired escrow
     *
     * @example
     * ```typescript
     * const tx = await EscrowTransaction.refundExpiredEscrow(
     *   demos,
     *   "twitter",
     *   "@unclaimed_user"
     * )
     * await demos.submitTransaction(tx)
     * ```
     *
     * @param demos - Demos SDK instance (must have keypair set)
     * @param platform - Social platform
     * @param username - Username
     * @returns Signed transaction ready to submit
     */
    static async refundExpiredEscrow(
        demos: Demos,
        platform: "twitter" | "github" | "telegram",
        username: string
    ): Promise<Transaction> {
        // Get refunder address from demos instance
        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const refunder = uint8ArrayToHex(publicKey as Uint8Array)

        // Compute escrow address
        const escrowAddress = this.getEscrowAddress(platform, username)

        // Get nonce
        const nonce = await demos.getAddressNonce(refunder)

        // Create empty transaction
        let tx = structuredClone(skeletons.transaction)

        // Build GCREdits
        const gcrEdits: GCREdit[] = [
            // 1. Refund escrow (checks expiry and depositor on node side)
            {
                type: "escrow",
                operation: "refund",
                account: escrowAddress,
                data: {
                    refunder,
                    platform,
                    username,
                },
                txhash: "",
                isRollback: false,
            },

            // 2. Add refund to original depositor
            {
                type: "balance",
                operation: "add",
                account: refunder,
                amount: 0, // Placeholder - filled by node during validation
                txhash: "",
                isRollback: false,
            },
        ]

        // Fill transaction content
        tx.content.from = refunder
        tx.content.to = escrowAddress
        tx.content.nonce = nonce + 1
        tx.content.amount = 0  // Amount filled by node
        tx.content.type = "escrow"
        tx.content.timestamp = Date.now()
        tx.content.gcr_edits = gcrEdits
        tx.content.data = [
            "escrow",
            {
                platform,
                username,
                operation: "refund",
            },
        ]

        // Sign transaction
        return await demos.sign(tx)
    }
}
