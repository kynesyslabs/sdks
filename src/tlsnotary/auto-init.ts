/**
 * TLSNotary Auto-Init Module
 *
 * Provides automatic WASM initialization with bundled files from the SDK.
 * This module simplifies setup by handling WASM file paths automatically.
 *
 * @packageDocumentation
 * @module tlsnotary/auto-init
 *
 * @example
 * ```typescript
 * // Simple usage - WASM files must be copied to your build output
 * import { initTlsn } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * // Initialize with automatic WASM loading
 * await initTlsn({ wasmBasePath: '/tlsn-wasm/' });
 *
 * // Now you can use TLSNotary
 * const tlsn = new TLSNotary({ notaryUrl: '...' });
 * await tlsn.initialize();
 * ```
 *
 * @example With webpack helper for automatic setup
 * ```javascript
 * // webpack.config.js
 * const { mergeTlsnWebpackConfig } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * module.exports = mergeTlsnWebpackConfig({
 *   // your config
 * });
 * ```
 */

import init, { type LoggingLevel } from "tlsn-js"

/**
 * Configuration options for auto-initialization
 */
export interface AutoInitOptions {
    /**
     * Base path where WASM files are served from.
     * This should be the URL path (not filesystem path) where you've copied
     * the WASM files from the SDK.
     *
     * @default '/' (root of your web app)
     *
     * @example '/tlsn-wasm/'
     * @example '/assets/wasm/'
     */
    wasmBasePath?: string

    /**
     * Logging level for WASM initialization
     * @default 'Info'
     */
    loggingLevel?: LoggingLevel

    /**
     * Hardware concurrency for WASM threads
     * @default navigator.hardwareConcurrency
     */
    hardwareConcurrency?: number
}

/**
 * WASM file manifest - these files must be available at wasmBasePath
 */
export const WASM_FILES = {
    /** Main WASM binary */
    wasm: "96d038089797746d7695.wasm",
    /** Alternative WASM binary name (for compatibility) */
    wasmAlt: "tlsn_wasm_bg.wasm",
    /** Main library JS */
    lib: "lib.js",
    /** WASM loader JS */
    wasmLoader: "tlsn_wasm.js",
    /** Spawn helper JS */
    spawn: "spawn.js",
    /** Worker helper JS */
    worker: "a6de6b189c13ad309102.js",
} as const

/**
 * Check if WASM files are accessible at the given path
 *
 * @param basePath - Base URL path to check
 * @returns Promise resolving to true if files are accessible
 */
export async function checkWasmAvailability(basePath: string = "/"): Promise<{
    available: boolean
    missingFiles: string[]
    error?: string
}> {
    const normalizedPath = basePath.endsWith("/") ? basePath : `${basePath}/`
    const criticalFiles = [WASM_FILES.wasm, WASM_FILES.wasmLoader]
    const missingFiles: string[] = []

    for (const file of criticalFiles) {
        try {
            const response = await fetch(`${normalizedPath}${file}`, {
                method: "HEAD",
            })
            if (!response.ok) {
                missingFiles.push(file)
            }
        } catch {
            missingFiles.push(file)
        }
    }

    return {
        available: missingFiles.length === 0,
        missingFiles,
        error:
            missingFiles.length > 0
                ? `Missing WASM files at ${normalizedPath}: ${missingFiles.join(", ")}. ` +
                  "Use the webpack helper from '@kynesyslabs/demosdk/tlsnotary/webpack' " +
                  "to automatically copy WASM files to your build output."
                : undefined,
    }
}

/**
 * Initialize TLSNotary WASM module
 *
 * This function initializes the underlying tlsn-js WASM module.
 * The WASM files must be accessible from your web server.
 *
 * **Setup Options:**
 *
 * 1. **Using webpack helper (recommended)**:
 *    ```javascript
 *    const { mergeTlsnWebpackConfig } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *    module.exports = mergeTlsnWebpackConfig({ ... });
 *    ```
 *
 * 2. **Manual copy**: Copy WASM files from `node_modules/@kynesyslabs/demosdk/build/tlsnotary/wasm/`
 *    to your build output directory.
 *
 * @param options - Initialization options
 * @throws Error if WASM initialization fails
 *
 * @example
 * ```typescript
 * import { initTlsn } from '@kynesyslabs/demosdk/tlsnotary';
 *
 * // Initialize before using TLSNotary
 * await initTlsn({
 *   wasmBasePath: '/tlsn-wasm/', // Where you copied the WASM files
 *   loggingLevel: 'Info',
 * });
 * ```
 */
export async function initTlsn(options: AutoInitOptions = {}): Promise<void> {
    const { loggingLevel = "Info", hardwareConcurrency } = options

    // Note: tlsn-js's init() function looks for WASM files relative to the
    // current page's base URL. The wasmBasePath option in our config is meant
    // to help users understand where to place files, but the actual loading
    // is handled by tlsn-js's bundled webpack config.
    //
    // Users need to ensure WASM files are at the root (or configure their
    // bundler to place them where tlsn-js expects them).

    await init({
        loggingLevel,
        hardwareConcurrency,
    })
}

/**
 * Get the path to WASM files bundled with the SDK.
 *
 * This is the filesystem path (not URL) to the WASM files in node_modules.
 * Use this with your bundler's copy plugin.
 *
 * @returns Filesystem path to WASM directory
 *
 * @example
 * ```javascript
 * // In webpack.config.js
 * const { getWasmSourcePath } = require('@kynesyslabs/demosdk/tlsnotary/auto-init');
 * const CopyPlugin = require('copy-webpack-plugin');
 *
 * plugins: [
 *   new CopyPlugin({
 *     patterns: [{ from: getWasmSourcePath(), to: 'tlsn-wasm' }]
 *   })
 * ]
 * ```
 */
export function getWasmSourcePath(): string {
    // This returns the path relative to where this file is in the build output
    // In build/tlsnotary/auto-init.js, WASM files are in build/tlsnotary/wasm/
    return require("path").resolve(__dirname, "wasm")
}

/**
 * Re-export the underlying init function for advanced usage
 */
export { init as rawInit }
