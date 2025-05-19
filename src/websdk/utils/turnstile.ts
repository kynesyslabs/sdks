import { Demos } from "../demosclass"
import { RPCResponse } from "@/types"

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
): Promise<RPCResponse> {
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
