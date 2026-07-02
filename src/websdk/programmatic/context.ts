import type { Demos } from "../demosclass"
import { runProgrammaticTx } from "./runner"
import type {
    ProgrammaticTxOptions,
    ProgrammaticTxResult,
    TxSource,
} from "./types"

/**
 * Shared context handed to every programmatic-tx sub-namespace factory.
 *
 * Sub-namespaces (`pay`, `attest`, `tokens`, …) never call `confirm`/
 * `broadcast` directly — they build/sign their transaction and pass it to
 * `ctx.run(...)`, which routes through the single shared runner so fee-cap
 * policy, confirmation strategy and result shape stay uniform.
 */
export interface ProgrammaticContext {
    /** The connected Demos instance. */
    readonly demos: Demos
    /**
     * Run a transaction through the shared confirm → broadcast pipeline.
     *
     * @param source - A signed/unsigned tx, an already-confirmed
     *                 validityData, or (preferred) a thunk that builds one.
     *                 Passing a thunk defers the build so errors surface
     *                 through the same call.
     * @param opts - Fee ceiling, confirmation strategy and wait behaviour.
     */
    run(
        source: TxSource,
        opts?: ProgrammaticTxOptions,
    ): Promise<ProgrammaticTxResult>
}

/** Build a {@link ProgrammaticContext} bound to a Demos instance. */
export function createProgrammaticContext(demos: Demos): ProgrammaticContext {
    return {
        demos,
        run: (source, opts) => runProgrammaticTx(demos, source, opts),
    }
}
