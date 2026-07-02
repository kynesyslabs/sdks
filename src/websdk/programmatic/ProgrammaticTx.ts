import type { Demos } from "../demosclass"
import { createProgrammaticContext } from "./context"
import { createPayNamespace } from "./pay"
import { createAttestNamespace } from "./attest"
import { createTokensNamespace } from "./tokens"
import { createStorageNamespace } from "./storage"
import { createEscrowNamespace } from "./escrow"
import { createValidatorNamespace } from "./validator"
import { createGovernanceNamespace } from "./governance"
import { createXmNamespace } from "./xm"
import { createBridgeNamespace } from "./bridge"
import { createDemosworkNamespace } from "./demoswork"
import { createIpfsNamespace } from "./ipfs"
import { createD402Namespace } from "./d402"

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
        /** Binary storage and storage programs. */
        storage: createStorageNamespace(ctx),
        /** Escrow to social identities (send / claim / refund). */
        escrow: createEscrowNamespace(ctx),
        /** Validator staking (stake / unstake / exit). */
        validator: createValidatorNamespace(ctx),
        /** Network-upgrade governance (propose / vote). */
        governance: createGovernanceNamespace(ctx),
        /** Cross-chain (XM) operation submission. */
        xm: createXmNamespace(ctx),
        /** Native bridge operation submission. */
        bridge: createBridgeNamespace(ctx),
        /** Demoswork workflow submission. */
        demoswork: createDemosworkNamespace(ctx),
        /** IPFS storage (add / pin / unpin). */
        ipfs: createIpfsNamespace(ctx),
        /** d402 payments. */
        d402: createD402Namespace(ctx),
    }
}

/** The shape of `demos.run`. */
export type ProgrammaticTx = ReturnType<typeof createProgrammaticTx>
