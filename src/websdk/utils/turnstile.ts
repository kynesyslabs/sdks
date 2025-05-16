import { Demos } from "../demosclass"
import { RPCResponseWithValidityData } from "@/types"

/**
 * Verify a Cloudflare Turnstile token to protect against bots
 *
 * @param demos The Demos instance to use for the RPC call
 * @param token The token from the Turnstile widget
 * @returns Response indicating if the token is valid
 */
export async function verifyTurnstileToken(
    demos: Demos,
    token: string,
): Promise<RPCResponseWithValidityData> {
    const request = {
        method: "gcr_routine",
        params: [
            {
                method: "verifyTurnstile",
                params: [token],
            },
        ],
    }

    return await demos.rpcCall(request, true)
}
