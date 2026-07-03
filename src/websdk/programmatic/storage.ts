import type { StorageProgramPayload } from "@/storage"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"

/**
 * On-chain storage as one-call programmatic transactions.
 *
 * Wraps {@link Demos.store} and {@link Demos.storagePrograms} so persisting
 * binary data or signing a storage program collapses the classic
 * `build/sign → confirm → broadcast` flow into a single call. Each builder
 * here returns a SIGNED transaction; the method hands a thunk producing it
 * to `ctx.run(...)`, which confirms against the fee ceiling and
 * auto-broadcasts — keeping fee-cap policy, confirmation strategy and result
 * shape uniform with the rest of `demos.run.*`.
 */
export function createStorageNamespace(ctx: ProgrammaticContext) {
    return {
        /**
         * Store binary data on the blockchain, end to end.
         *
         * @example
         * ```ts
         * const bytes = new TextEncoder().encode("hello world")
         * // auto-broadcast within the 5 DEM fee cap:
         * await demos.run.storage.store(bytes)
         * // build + confirm only, broadcast later yourself:
         * const r = await demos.run.storage.store(bytes, { confirm: "manual" })
         * await demos.broadcast(r.validityData)
         * ```
         *
         * @param bytes - The binary data to store in the sender's account.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        store: (
            bytes: Uint8Array,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(() => ctx.demos.store(bytes, { nonce: opts?.nonce }), opts),

        /**
         * Sign and submit a storage program, end to end.
         *
         * @example
         * ```ts
         * const r = await demos.run.storage.program({
         *     storageAddress: "0x...",
         *     // …program payload fields
         * })
         * ```
         *
         * @param payload - The storage program payload to sign (must carry a
         *                   `storageAddress`).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        program: (
            payload: StorageProgramPayload,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    ctx.demos.storagePrograms.sign(payload, {
                        nonce: opts?.nonce,
                    }),
                opts,
            ),
    }
}
