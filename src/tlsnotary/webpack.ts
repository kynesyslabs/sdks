/**
 * TLSNotary Webpack Configuration Helper
 *
 * Provides pre-configured webpack settings for TLSNotary WASM integration.
 * This helper makes it easy to set up TLSNotary in webpack projects without
 * manually configuring WASM file copying and Node.js polyfills.
 *
 * @packageDocumentation
 * @module tlsnotary/webpack
 *
 * @example
 * ```javascript
 * // webpack.config.js
 * const { getTlsnWebpackConfig, getTlsnWasmPath } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * module.exports = {
 *   // ... your config
 *   plugins: [
 *     ...getTlsnWebpackConfig().plugins,
 *   ],
 *   resolve: {
 *     fallback: {
 *       ...getTlsnWebpackConfig().resolve.fallback,
 *     },
 *   },
 * };
 * ```
 *
 * @example Using the merge helper
 * ```javascript
 * const { mergeTlsnWebpackConfig } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * module.exports = mergeTlsnWebpackConfig({
 *   entry: './src/index.ts',
 *   output: { path: './dist' },
 * });
 * ```
 */

import * as path from "path"

/**
 * Get the absolute path to the bundled WASM files directory.
 *
 * This returns the path to the pre-bundled tlsn-js WASM files included
 * in the SDK. Use this when configuring CopyWebpackPlugin or other
 * file copying mechanisms.
 *
 * @returns Absolute path to the WASM directory
 *
 * @example
 * ```javascript
 * const { getTlsnWasmPath } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * new CopyWebpackPlugin({
 *   patterns: [
 *     { from: getTlsnWasmPath(), to: 'tlsn-wasm' }
 *   ]
 * });
 * ```
 */
export function getTlsnWasmPath(): string {
    // __dirname will be build/tlsnotary after compilation
    // WASM files are in build/tlsnotary/wasm
    return path.resolve(__dirname, "wasm")
}

/**
 * Get the path to a specific WASM file.
 *
 * @param filename - The WASM filename (e.g., 'tlsn_wasm_bg.wasm')
 * @returns Absolute path to the specific WASM file
 */
export function getTlsnWasmFile(filename: string): string {
    return path.join(getTlsnWasmPath(), filename)
}

/**
 * Node.js polyfill configuration for browser environments.
 *
 * TLSNotary requires certain Node.js modules to be polyfilled
 * when running in the browser.
 */
export const nodeFallbacks = {
    crypto: false,
    stream: false,
    buffer: require.resolve("buffer/"),
    process: false,
    fs: false,
    path: false,
    os: false,
}

/**
 * Get webpack configuration for TLSNotary integration.
 *
 * Returns a partial webpack configuration object that can be merged
 * with your existing config. Includes:
 * - CopyWebpackPlugin configuration for WASM files
 * - Node.js polyfill fallbacks
 * - Required plugins array
 *
 * @param options - Configuration options
 * @param options.wasmOutputPath - Output path for WASM files (default: 'tlsn-wasm')
 * @param options.publicPath - Public path prefix for WASM files (default: '/')
 * @returns Partial webpack configuration
 *
 * @example
 * ```javascript
 * const { getTlsnWebpackConfig } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 * const config = getTlsnWebpackConfig({ wasmOutputPath: 'assets/wasm' });
 * ```
 */
export function getTlsnWebpackConfig(options: {
    wasmOutputPath?: string
    publicPath?: string
} = {}): {
    plugins: any[]
    resolve: { fallback: typeof nodeFallbacks }
    experiments: { asyncWebAssembly: boolean }
} {
    const { wasmOutputPath = "tlsn-wasm" } = options

    // Dynamic import to avoid requiring CopyWebpackPlugin as a peer dependency
    // Users must have it installed in their project
    let CopyWebpackPlugin: any
    try {
        CopyWebpackPlugin = require("copy-webpack-plugin")
    } catch {
        console.warn(
            "[TLSNotary] copy-webpack-plugin not found. " +
            "Install it with: npm install --save-dev copy-webpack-plugin"
        )
        return {
            plugins: [],
            resolve: { fallback: nodeFallbacks },
            experiments: { asyncWebAssembly: true },
        }
    }

    return {
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: getTlsnWasmPath(),
                        to: wasmOutputPath,
                        globOptions: {
                            ignore: ["**/*.map", "**/*.d.ts"],
                        },
                    },
                ],
            }),
        ],
        resolve: {
            fallback: nodeFallbacks,
        },
        experiments: {
            asyncWebAssembly: true,
        },
    }
}

/**
 * Merge TLSNotary webpack config with an existing configuration.
 *
 * This is a convenience helper that deep-merges the TLSNotary
 * configuration with your existing webpack config.
 *
 * @param existingConfig - Your existing webpack configuration
 * @param tlsnOptions - TLSNotary-specific options
 * @returns Merged webpack configuration
 *
 * @example
 * ```javascript
 * const { mergeTlsnWebpackConfig } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * module.exports = mergeTlsnWebpackConfig({
 *   entry: './src/index.ts',
 *   output: {
 *     filename: 'bundle.js',
 *     path: path.resolve(__dirname, 'dist'),
 *   },
 *   module: {
 *     rules: [
 *       { test: /\.tsx?$/, use: 'ts-loader' },
 *     ],
 *   },
 * });
 * ```
 */
export function mergeTlsnWebpackConfig<T extends Record<string, any>>(
    existingConfig: T,
    tlsnOptions: Parameters<typeof getTlsnWebpackConfig>[0] = {}
): T {
    const tlsnConfig = getTlsnWebpackConfig(tlsnOptions)

    return {
        ...existingConfig,
        plugins: [
            ...(existingConfig.plugins || []),
            ...tlsnConfig.plugins,
        ],
        resolve: {
            ...(existingConfig.resolve || {}),
            fallback: {
                ...(existingConfig.resolve?.fallback || {}),
                ...tlsnConfig.resolve.fallback,
            },
        },
        experiments: {
            ...(existingConfig.experiments || {}),
            ...tlsnConfig.experiments,
        },
    }
}

/**
 * Get headers required for SharedArrayBuffer support.
 *
 * TLSNotary uses SharedArrayBuffer for WASM threads, which requires
 * specific CORS headers. Use these with your dev server configuration.
 *
 * @returns Object with required headers
 *
 * @example
 * ```javascript
 * const { getCrossOriginHeaders } = require('@kynesyslabs/demosdk/tlsnotary/webpack');
 *
 * // webpack-dev-server config
 * devServer: {
 *   headers: getCrossOriginHeaders(),
 * }
 * ```
 */
export function getCrossOriginHeaders(): Record<string, string> {
    return {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
    }
}

/**
 * Complete webpack dev server configuration for TLSNotary.
 *
 * @param port - Dev server port (default: 8080)
 * @returns Dev server configuration object
 */
export function getTlsnDevServerConfig(port = 8080): {
    port: number
    hot: boolean
    headers: Record<string, string>
    static: { directory: string }[]
} {
    return {
        port,
        hot: true,
        headers: getCrossOriginHeaders(),
        static: [
            {
                directory: getTlsnWasmPath(),
            },
        ],
    }
}
