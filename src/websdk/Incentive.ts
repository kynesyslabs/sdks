import { Demos } from "./demosclass"
import { RPCResponseWithValidityData } from "@/types"
import { DemosTransactions } from "./DemosTransactions"
import { GCREditIncentive } from "@/types/blockchain/GCREdit"
import { Transaction } from "@/types/blockchain/Transaction"

export class Incentive {
    private demos: Demos

    constructor(demos: Demos) {
        this.demos = demos
    }

    /**
     * Create and confirm an incentive transaction
     *
     * @param incentiveType The type of incentive
     * @param operation The operation to perform
     * @param data Additional data for the incentive
     * @returns Confirmed validity data ready for broadcast
     */
    private async createIncentiveTransaction(
        incentiveType: "wallet_linked" | "social_linked" | "get_points",
        operation: "award" = "award",
        data: Record<string, any> = {},
    ): Promise<RPCResponseWithValidityData> {
        const tx = DemosTransactions.empty()
        const address = this.demos.getAddress()

        // Create incentive edit
        const incentiveEdit: GCREditIncentive = {
            type: "incentive",
            isRollback: false,
            account: address,
            operation: operation,
            incentiveType: incentiveType,
            incentiveSubtype: incentiveType,
            data,
            txhash: "", // Will be set when tx is created
        }

        // Set up transaction content
        tx.content = {
            type: "incentive",
            from: address,
            to: address,
            amount: 0,
            data: ["incentive", incentiveEdit],
            nonce: (await this.demos.getAddressNonce(address)) + 1,
            timestamp: Date.now(),
            gcr_edits: [incentiveEdit],
            transaction_fee: {
                network_fee: 0,
                rpc_fee: 0,
                additional_fee: 0,
            },
        }

        // Sign and confirm
        const signedTx = await this.demos.sign(tx)
        return await this.demos.confirm(signedTx)
    }

    /**
     * Get user's current points
     */
    async getUserPoints(): Promise<RPCResponseWithValidityData> {
        try {
            const validityData = await this.createIncentiveTransaction(
                "get_points",
            )

            return await this.demos.broadcast(validityData)
        } catch (error) {
            console.error("Error getting user points:", error)

            // Return error response
            return {
                result: 400,
                response: null,
                require_reply: false,
                extra: {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            }
        }
    }

    /**
     * Award points for linking a Web3 wallet
     *
     * @param walletAddress The address of the wallet
     * @param chain The chain of the wallet (e.g. "evm", "solana", "ton")
     * @returns Response from the node after processing the incentive
     */
    async awardWalletPoints(
        walletAddress: string,
        chain: string,
    ): Promise<RPCResponseWithValidityData> {
        try {
            const validityData = await this.createIncentiveTransaction(
                "wallet_linked",
                "award",
                { walletAddress, chain },
            )
            return await this.demos.broadcast(validityData)
        } catch (error) {
            console.error("Error awarding wallet points:", error)
            return {
                result: 400,
                response: null,
                require_reply: false,
                extra: {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            }
        }
    }

    /**
     * Award points for linking a social media account
     *
     * @param username The username on the social platform
     * @param platform The social platform (e.g. "twitter")
     * @returns Response from the node after processing the incentive
     */
    async awardSocialPoints(
        username: string,
        platform: string,
    ): Promise<RPCResponseWithValidityData> {
        try {
            const validityData = await this.createIncentiveTransaction(
                "social_linked",
                "award",
                { username, platform },
            )
            return await this.demos.broadcast(validityData)
        } catch (error) {
            console.error("Error awarding social points:", error)
            return {
                result: 400,
                response: null,
                require_reply: false,
                extra: {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            }
        }
    }
}
