import type { XMScript } from "@/types"
import { prepareXMPayload } from "../XMTransactions"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Cross-chain (XM) operations as one-call programmatic transactions.
 *
 * Building the `XMScript` is inherently chain-specific (per-chain signed
 * payloads, RPC selection, EVM vs non-EVM task shape, …) and therefore stays
 * with the caller. Once a script is assembled, this namespace collapses the
 * classic `prepareXMPayload → confirm → broadcast` flow into a single call
 * that auto-broadcasts within the configured fee ceiling.
 */
export function createXmNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Submit a fully-built {@link XMScript} as a `crosschainOperation`
         * transaction, end to end.
         *
         * `prepareXMPayload` signs the transaction; the shared runner then
         * confirms it and (in `"auto"` mode) broadcasts it within the fee cap.
         *
         * @example
         * ```ts
         * import { prepareXMScript } from "@kynesyslabs/demosdk"
         * const xmScript = prepareXMScript({ chain: "eth", ... })
         * // auto-broadcast within the fee cap:
         * await demos.run.xm.submit(xmScript)
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.xm.submit(xmScript, { confirm: "manual" })
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param xmScript - The assembled cross-chain script to execute.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        submit: (
            xmScript: XMScript,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => prepareXMPayload(xmScript, ctx.demos), opts),
    }
}
