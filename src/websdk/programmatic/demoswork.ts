import { type DemosWork, prepareDemosWorkPayload } from "@/demoswork"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * DemosWork scripts as one-call programmatic transactions.
 *
 * Assembling a {@link DemosWork} (its steps, operations and conditionals) stays
 * with the caller. Once built, this namespace collapses the classic
 * `prepareDemosWorkPayload → confirm → broadcast` flow into a single call that
 * auto-broadcasts within the configured fee ceiling.
 */
export function createDemosworkNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Submit an assembled {@link DemosWork} script as a `demoswork`
         * transaction, end to end.
         *
         * `prepareDemosWorkPayload` serialises and signs the work; the shared
         * runner then confirms it and (in `"auto"` mode) broadcasts it within
         * the fee cap.
         *
         * @example
         * ```ts
         * import { DemosWork } from "@kynesyslabs/demosdk"
         * const work = new DemosWork()
         * // ... push steps / operations onto `work` ...
         * // auto-broadcast within the fee cap:
         * await demos.run.demoswork.submit(work)
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.demoswork.submit(work, { confirm: "manual" })
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param work - The assembled DemosWork script to execute.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        submit: (
            work: DemosWork,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => prepareDemosWorkPayload(work, ctx.demos), opts),
    }
}
