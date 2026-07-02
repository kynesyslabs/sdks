import type { Demos } from "../demosclass"
import { createProgrammaticContext } from "./context"
import { createPayNamespace } from "./pay"
import { createAttestNamespace } from "./attest"
import { createTokensNamespace } from "./tokens"

/**
 * Build the `demos.run` programmatic-transaction facade for a Demos instance.
 *
 * Composes the typed one-call namespaces (`pay`/`transfer`, `attest.*`,
 * `tokens.*`) over a single shared context, so every method routes through
 * the same `confirm → broadcast` runner with uniform fee-cap policy and
 * result shape. Additive — the classic `demos.pay`/`confirm`/`broadcast`
 * methods are untouched.
 *
 * @param demos - The Demos instance the facade is bound to.
 */
export function createProgrammaticTx(demos: Demos) {
    const ctx = createProgrammaticContext(demos)

    return {
        ...createPayNamespace(ctx),
        /** Identity attestations (web2 proofs) + the DAHR web2-proxy. */
        attest: createAttestNamespace(ctx),
        /** Token creation and execution. */
        tokens: createTokensNamespace(ctx),
    }
}

/** The shape of `demos.run`. */
export type ProgrammaticTx = ReturnType<typeof createProgrammaticTx>
