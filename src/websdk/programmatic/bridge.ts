import { NativeBridgeMethods } from "@/bridge"
import type { BridgeOperationCompiled } from "@/bridge/nativeBridgeTypes"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * Native bridge operations as one-call programmatic transactions.
 *
 * The native bridge is a two-step flow: first an RPC (`generateOperation` →
 * node) produces a {@link BridgeOperationCompiled}, then that compiled
 * operation is turned into a signed `nativeBridge` transaction. Compiling is a
 * round-trip to the node and stays with the caller; this namespace exposes only
 * the transaction step, collapsing `generateOperationTx → confirm → broadcast`
 * into a single call that auto-broadcasts within the configured fee ceiling.
 */
export function createBridgeNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Submit a compiled bridge operation as a `nativeBridge` transaction,
         * end to end.
         *
         * `NativeBridgeMethods.generateOperationTx` signs the transaction
         * (deriving nonce from the Demos instance); the shared runner then
         * confirms it and (in `"auto"` mode) broadcasts it within the fee cap.
         *
         * @example
         * ```ts
         * // `compiled` comes back from the node's nativeBridge RPC:
         * await demos.run.bridge.submit(compiled)
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.bridge.submit(compiled, { confirm: "manual" })
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param compiled - The compiled bridge operation returned by the RPC.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        submit: (
            compiled: BridgeOperationCompiled,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    NativeBridgeMethods.generateOperationTx(
                        compiled,
                        ctx.demos,
                        { nonce: opts?.nonce },
                    ),
                opts,
            ),
    }
}
