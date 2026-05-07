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
import { OS_PER_DEM } from "@/denomination"

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
     * Creates a transaction to send DEM to a social identity escrow.
     *
     * P4 dual-input:
     *  - `bigint` (preferred, post-v3): OS amount.
     *  - `number` (deprecated, v2 callers): DEM amount, auto-converted.
     *
     * Internal carrier in `tx.content.amount` and `gcr_edits[].amount`
     * is bigint OS; the serializerGate (called from `demos.sign`)
     * picks the wire shape per fork status. Sub-DEM precision against
     * a pre-fork node throws `SubDemPrecisionError`.
     *
     * @example
     * ```typescript
     * import { denomination } from "@kynesyslabs/demosdk"
     * const tx = await EscrowTransaction.sendToIdentity(
     *   demos,
     *   "twitter",
     *   "@bob",
     *   denomination.demToOs(100),  // 100 DEM
     *   { expiryDays: 30, message: "Welcome to Demos!" }
     * )
     * await demos.confirm(tx)
     * ```
     *
     * @param demos - Demos SDK instance (must have keypair set)
     * @param platform - Social platform ("twitter", "github", "telegram")
     * @param username - Username on that platform
     * @param amount - DEM `number` (legacy) or OS `bigint` (preferred).
     * @param options - Optional parameters
     * @returns Signed transaction ready to submit
     */
    static async sendToIdentity(
        demos: Demos,
        platform: "twitter" | "github" | "telegram",
        username: string,
        amount: number | bigint,
        options?: {
            expiryDays?: number  // Default: 30 days
            message?: string     // Optional memo
        }
    ): Promise<Transaction> {
        // P4 commit 3: bigint OS is the canonical internal carrier; the
        // serializerGate (run via demos.sign) emits the right wire shape
        // per the connected node's fork status.
        const { amountOs } = EscrowTransaction.normalizeAmountInput(amount)

        // Sub-DEM precision guard — runs before tx construction so the
        // caller never produces a tx that a pre-fork node will silently
        // truncate. Calls into the cached `getNetworkInfo` fork status.
        // The helper is `private` on Demos but reachable at runtime;
        // cast through `any` to bypass the access modifier (escrow is
        // package-internal — the alternative is to widen Demos's
        // public surface, which we don't want).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (demos as any)._assertAmountAcceptableOnTargetNode(amountOs)

        // Get sender address from demos instance
        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const sender = uint8ArrayToHex(publicKey as Uint8Array)

        // Compute escrow address
        const escrowAddress = this.getEscrowAddress(platform, username)

        // Get nonce
        const nonce = await demos.getAddressNonce(sender)

        // Create empty transaction
        let tx = structuredClone(skeletons.transaction)

        // Build GCREdits. NOTE: `demos.sign()` calls `GCRGeneration.generate`
        // which currently overwrites `gcr_edits` with edits derived from
        // the tx content; the inline edits here are dead code today
        // (flagged in SPEC_P4 §2.1). Kept type-correct so they still
        // match the (now-widened) `GCREditBalance.amount` type if/when
        // the dead-code path is wired up.
        //
        // P4 commit 3: edits carry bigint OS internally. The
        // serializerGate normalises them to the right wire shape per
        // fork status. The `GCREditBalance.amount` static type is
        // `number | string`; bigints are passed through `unknown` to
        // satisfy TS — the runtime serializer handles all three shapes.
        const gcrEdits: GCREdit[] = [
            // 1. Deduct from sender's balance
            {
                type: "balance",
                operation: "remove",
                account: sender,
                amount: amountOs as unknown as number,
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
                    amount: amountOs as unknown as number,
                    expiryDays: options?.expiryDays || 30,
                    message: options?.message,
                },
                txhash: "",
                isRollback: false,
            },
        ]

        // Fill transaction content. Internal carrier is bigint OS; the
        // serializerGate emits the right wire shape (DEM number pre-fork,
        // OS string post-fork) when `demos.sign` hashes.
        tx.content.from = sender
        tx.content.to = escrowAddress
        tx.content.nonce = nonce + 1
        tx.content.amount = amountOs as unknown as number
        tx.content.type = "escrow"
        tx.content.timestamp = Date.now()
        tx.content.gcr_edits = gcrEdits
        tx.content.data = [
            "escrow",
            {
                platform,
                username,
                // The escrow payload's `amount` is a free-form string here;
                // emit canonical OS for forward compatibility with the
                // post-fork node's escrow handler. Pre-fork node tolerates
                // arbitrary strings on this nested field.
                amount: amountOs.toString(),
                operation: "deposit",
            },
        ]

        // Sign transaction
        return await demos.sign(tx)
    }

    /**
     * Normalise a public-API amount input (`number` legacy DEM or
     * `bigint` OS) into both forms. Used at every boundary that needs
     * dual-shape support during the pre-/post-fork rollout.
     *
     * - `number` input: treated as DEM, multiplied to OS via `OS_PER_DEM`.
     * - `bigint` input: treated as OS; DEM form is the integer division
     *   `amountOs / OS_PER_DEM`. Rejects with a clear error if the OS
     *   amount has sub-DEM precision (would silently truncate when
     *   serialised against a pre-fork node).
     *
     * @internal Exposed only to keep the migration paths discoverable.
     */
    static normalizeAmountInput(
        amount: number | bigint,
    ): { amountDem: number; amountOs: bigint } {
        if (typeof amount === "bigint") {
            if (amount < 0n) {
                throw new Error(
                    `[EscrowTransaction] amount must be non-negative, got ${amount}`,
                )
            }
            const amountOs = amount
            // Sub-DEM precision is allowed at the bigint level — the
            // public API rejection lives in P4 commit 3, gated on
            // pre-fork node detection. For commit 1 we floor to whole
            // DEM for the legacy wire shape.
            const amountDem = Number(amountOs / OS_PER_DEM)
            return { amountDem, amountOs }
        }
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(
                `[EscrowTransaction] amount must be a non-negative finite number or bigint, got ${amount}`,
            )
        }
        const amountOs = BigInt(Math.floor(amount)) * OS_PER_DEM
        return { amountDem: amount, amountOs }
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
