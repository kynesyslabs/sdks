/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

import { Demos } from "@/websdk"
import { EscrowTransaction } from "./EscrowTransaction"

/**
 * Escrow balance information
 */
export interface EscrowBalance {
    escrowAddress: string
    exists: boolean
    balance: string  // Stringified bigint
    deposits: Array<{
        from: string
        amount: string
        timestamp: number
        message?: string
    }>
    expiryTimestamp: number
    expired: boolean
}

/**
 * Claimable escrow information
 */
export interface ClaimableEscrow {
    platform: "twitter" | "github" | "telegram"
    username: string
    balance: string  // Stringified bigint
    escrowAddress: string
    deposits: Array<{
        from: string
        amount: string
        timestamp: number
        message?: string
    }>
    expiryTimestamp: number
    expired: boolean
}

/**
 * Sent escrow information
 */
export interface SentEscrow {
    platform: "twitter" | "github" | "telegram"
    username: string
    escrowAddress: string
    totalSent: string  // Stringified bigint
    deposits: Array<{
        amount: string
        timestamp: number
        message?: string
    }>
    totalEscrowBalance: string
    expired: boolean
    expiryTimestamp: number
}

/**
 * RPC query helpers for escrow operations
 * Convenience wrappers around RPC endpoints
 */
export class EscrowQueries {
    /**
     * Query escrow balance for a specific social identity
     *
     * @example
     * ```typescript
     * const escrow = await EscrowQueries.getEscrowBalance(
     *   demos,
     *   "twitter",
     *   "@bob"
     * )
     * console.log(`Escrow balance: ${escrow.balance} DEM`)
     * ```
     *
     * @param demos - Demos SDK instance
     * @param platform - Social platform
     * @param username - Username on that platform
     * @returns Escrow balance information
     */
    static async getEscrowBalance(
        demos: Demos,
        platform: string,
        username: string
    ): Promise<EscrowBalance> {
        const request = {
            method: "get_escrow_balance",
            params: [{ platform, username }],
        }

        const result = await demos.rpcCall(request, false)
        return result.response as EscrowBalance
    }

    /**
     * Get all escrows claimable by a Demos address
     * Checks which Web2 identities the address has proven
     *
     * @example
     * ```typescript
     * const claimable = await EscrowQueries.getClaimableEscrows(
     *   demos,
     *   myAddress
     * )
     * console.log(`You have ${claimable.length} claimable escrows`)
     * ```
     *
     * @param demos - Demos SDK instance
     * @param address - Demos address to check
     * @returns Array of claimable escrows
     */
    static async getClaimableEscrows(
        demos: Demos,
        address: string
    ): Promise<ClaimableEscrow[]> {
        const request = {
            method: "get_claimable_escrows",
            params: [{ address }],
        }

        const result = await demos.rpcCall(request, false)
        return result.response as ClaimableEscrow[]
    }

    /**
     * Get all escrows sent by a specific address
     * Useful for seeing where you've sent funds
     *
     * @example
     * ```typescript
     * const sent = await EscrowQueries.getSentEscrows(
     *   demos,
     *   myAddress
     * )
     * console.log(`You've sent escrows to ${sent.length} identities`)
     * ```
     *
     * @param demos - Demos SDK instance
     * @param sender - Sender's Demos address
     * @returns Array of sent escrows
     */
    static async getSentEscrows(
        demos: Demos,
        sender: string
    ): Promise<SentEscrow[]> {
        const request = {
            method: "get_sent_escrows",
            params: [{ sender }],
        }

        const result = await demos.rpcCall(request, false)
        return result.response as SentEscrow[]
    }
}
