import { D402Client, type D402PaymentRequirement } from "@/d402/client"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * HTTP 402 ("d402") payments as one-call programmatic transactions.
 *
 * Wraps {@link D402Client.createPayment}, which turns the payment
 * requirements from a 402 response into an UNSIGNED `d402_payment`
 * transaction. The method hands a thunk producing that transaction to
 * `ctx.run(...)`, which signs, confirms against the fee ceiling and
 * auto-broadcasts — keeping fee-cap policy, confirmation strategy and result
 * shape uniform with the rest of `demos.run.*`.
 */
export function createD402Namespace(ctx: ProgrammaticContext) {
    const client = new D402Client(ctx.demos)

    return {
        /**
         * Settle an HTTP 402 payment requirement, end to end.
         *
         * @example
         * ```ts
         * const res = await fetch("/premium")
         * if (res.status === 402) {
         *     const requirement = await res.json()
         *     // auto-broadcast within the 5 DEM fee cap:
         *     await demos.run.d402.pay(requirement)
         * }
         * ```
         *
         * @param requirement - Payment requirements from the 402 response
         *                       (amount, recipient, resourceId, description).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        pay: (
            requirement: D402PaymentRequirement,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    client.createPayment(requirement, { nonce: opts?.nonce }),
                opts,
            ),
    }
}
