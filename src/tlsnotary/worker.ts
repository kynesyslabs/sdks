/**
 * TLSNotary Web Worker
 *
 * Runs TLSNotary WASM operations in a separate thread to avoid blocking the main thread.
 * Uses Comlink for seamless RPC between main thread and worker.
 */
import * as Comlink from "comlink"
import init, { Prover, Presentation } from "tlsn-js"

/**
 * Worker API exposed via Comlink
 */
const workerApi = {
    /**
     * Initialize the WASM module
     */
    init,

    /**
     * Prover class for creating attestations
     */
    Prover,

    /**
     * Presentation class for verifying attestations
     */
    Presentation,
}

// Expose the API via Comlink
Comlink.expose(workerApi)

export type WorkerApi = typeof workerApi
