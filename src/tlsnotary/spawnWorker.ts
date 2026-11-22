/**
 * Starts the prover worker. Kept in its own module, next to worker.js, so the
 * `import.meta.url` that bundlers need stays out of TLSNotary.ts: a CommonJS
 * test run cannot load a module that contains it.
 */
export function spawnTlsnWorker(): Worker {
    // Bundlers (webpack, vite) resolve this exact `new Worker(new URL(...))`
    // pattern; the .js extension matches the compiled output.
    return new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
    })
}
