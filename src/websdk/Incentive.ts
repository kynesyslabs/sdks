// sdks/src/websdk/IncentiveSDK.ts

import { Demos } from "./demosclass"
import { RPCResponseWithValidityData } from "@/types"

export class Incentive {
    private demos: Demos

    constructor(demos: Demos) {
        this.demos = demos
    }

    /**
     * Get user's current points and reputation
     */
    async getUserPoints(): Promise<RPCResponseWithValidityData> {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "incentive_getPoints",
                    params: [],
                },
            ],
        }
        return await this.demos.rpcCall(request, true)
    }

    /**
     * Manually trigger points for identity creation
     * (Normally this would be called automatically)
     */
    async triggerIdentityCreationPoints(): Promise<RPCResponseWithValidityData> {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "incentive_identityCreated",
                    params: [],
                },
            ],
        }
        return await this.demos.rpcCall(request, true)
    }

    /**
     * Manually trigger points for wallet linking
     * (Normally this would be called automatically)
     */
    async triggerWalletLinkingPoints(
        walletAddress: string,
        chain: string,
    ): Promise<RPCResponseWithValidityData> {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "incentive_walletLinked",
                    params: [walletAddress, chain],
                },
            ],
        }
        return await this.demos.rpcCall(request, true)
    }

    /**
     * Manually trigger points for Twitter linking
     * (Normally this would be called automatically)
     */
    async triggerTwitterLinkingPoints(
        twitterHandle: string,
    ): Promise<RPCResponseWithValidityData> {
        const request = {
            method: "gcr_routine",
            params: [
                {
                    method: "incentive_twitterLinked",
                    params: [twitterHandle],
                },
            ],
        }
        return await this.demos.rpcCall(request, true)
    }
}
