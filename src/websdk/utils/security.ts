import { Demos } from "../demosclass"
import { DemosTransactions } from "../DemosTransactions"
import { RPCResponseWithValidityData } from "@/types"
import { TurnstileVerificationPayload } from "@/types/abstraction"

/**
 * Verify a Cloudflare Turnstile token to protect against bots
 *
 * @param demos The Demos instance to use for signing and broadcasting
 * @param token The token from the Turnstile widget
 * @returns Response indicating if the token is valid
 */
export async function verifyTurnstileToken(
    demos: Demos,
    token: string,
): Promise<RPCResponseWithValidityData> {
    try {
        const tx = DemosTransactions.empty()
        const address = demos.getAddress()
        const turnstilePayload: TurnstileVerificationPayload = {
            context: "security",
            method: "verify_turnstile",
            payload: {
                token: token,
            },
        }

        tx.content = {
            type: "identity",
            from: address,
            to: address,
            amount: 0,
            data: ["identity", turnstilePayload],
            gcr_edits: [],
            nonce: (await demos.getAddressNonce(address)) + 1,
            timestamp: Date.now(),
            transaction_fee: {
                network_fee: 0,
                rpc_fee: 0,
                additional_fee: 0,
            },
        }

        const signedTx = await demos.sign(tx)
        const validityData = await demos.confirm(signedTx)

        return await demos.broadcast(validityData)
    } catch (error) {
        return {
            result: 400,
            response: null,
            require_reply: false,
            extra: {
                error: error instanceof Error ? error.message : String(error),
            },
        }
    }
}
