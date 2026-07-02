/**
 * Programmatic transaction system.
 *
 * A single one-call method per transaction type that fills parameters from
 * arguments and routes through one shared runner (`build → sign → confirm →
 * broadcast`). Auto-broadcasts within a configurable fee ceiling (default
 * 5 DEM); supports a `"manual"` confirm mode that returns the validity data
 * unbroadcast (the classic flow), and a callback mode for custom
 * confirmation.
 *
 * Reached via `demos.run.*` on a connected {@link Demos} instance.
 */
export * from "./types"
export * from "./errors"
export * from "./runner"
export * from "./context"
export * from "./pay"
export * from "./attest"
export * from "./tokens"
export * from "./storage"
export * from "./escrow"
export * from "./validator"
export * from "./governance"
export * from "./xm"
export * from "./bridge"
export * from "./demoswork"
export * from "./ipfs"
export * from "./d402"
export * from "./ProgrammaticTx"
