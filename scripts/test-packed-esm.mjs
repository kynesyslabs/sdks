#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path, { delimiter } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const temporaryRoot = await fs.mkdtemp(
    path.join(tmpdir(), "demosdk-packed-esm-"),
)
const childEnvironment = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
}

const packageMetadata = JSON.parse(
    await fs.readFile(path.join(repository, "package.json"), "utf8"),
)
const typecheckedEntrypoints = [
    "./types",
    "./websdk",
    "./demoswork",
    "./tlsnotary",
    "./tlsnotary/service",
    "./tlsnotary/webpack",
    "./tlsnotary/auto-init",
]
for (const entrypoint of typecheckedEntrypoints) {
    if (!(entrypoint in packageMetadata.exports)) {
        throw new Error(`packed-esm: missing package export ${entrypoint}`)
    }
}

const optionalRuntimeEntrypoints = new Set(["./bridge/rubic"])
const runtimeEntrypoints = Object.keys(packageMetadata.exports).filter(
    (entrypoint) =>
        !entrypoint.includes("*") &&
        !optionalRuntimeEntrypoints.has(entrypoint),
)

function packageSpecifier(entrypoint) {
    return entrypoint === "."
        ? packageMetadata.name
        : `${packageMetadata.name}${entrypoint.slice(1)}`
}

const compilerOptions = {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["node"],
}

async function writeConsumer(directory, source, compilerOverrides = {}) {
    await fs.mkdir(directory)
    await fs.writeFile(
        path.join(directory, "package.json"),
        `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
        "utf8",
    )
    await fs.writeFile(path.join(directory, "consumer.ts"), source, "utf8")
    await fs.writeFile(
        path.join(directory, "tsconfig.json"),
        `${JSON.stringify(
            {
                compilerOptions: {
                    ...compilerOptions,
                    ...compilerOverrides,
                },
                include: ["consumer.ts"],
            },
            null,
            2,
        )}\n`,
        "utf8",
    )
}

function installConsumer(directory, packages, options = []) {
    execFileSync(
        "npm",
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--loglevel=error",
            ...options,
            ...packages,
        ],
        { cwd: directory, stdio: "inherit", env: childEnvironment },
    )
}

function typecheckConsumer(directory) {
    execFileSync(
        path.join(directory, "node_modules", ".bin", "tsc"),
        ["--project", "tsconfig.json"],
        { cwd: directory, stdio: "inherit", env: childEnvironment },
    )
}

async function assertPackageAbsent(directory, packageName) {
    try {
        await fs.access(path.join(directory, "node_modules", packageName))
        throw new Error(
            `packed-esm: ${packageName} was installed despite --omit=optional`,
        )
    } catch (error) {
        if (error?.code !== "ENOENT") throw error
    }
}

async function assertPackagePresent(directory, packageName) {
    try {
        await fs.access(path.join(directory, "node_modules", packageName))
    } catch (error) {
        if (error?.code === "ENOENT") {
            throw new Error(`packed-esm: expected ${packageName} to be installed`)
        }
        throw error
    }
}

const compatibilityAssertions = [
    "void trade.type",
    "void trade.from",
    "void trade.to",
    "void trade.toTokenAmountMin",
    "void trade.feeInfo",
    "void trade.onChainSubtype",
    "void trade.bridgeType",
    "void trade.isAggregator",
    "trade.promotions = [...trade.promotions]",
    "void trade.networkFee",
    "void trade.platformFee",
    "trade.apiFromAddress = null",
    "void trade.needApprove()",
    "void trade.approve({}, true, \"infinity\")",
    "void trade.swap()",
    'void trade.encode({ fromAddress: "0x" })',
    'void trade.encodeApprove("0x", "0x", "infinity", {})',
    "void trade.checkBlockchainRequirements()",
    "void trade.getUsdPrice()",
    "void trade.getTradeInfo()",
    "wrapped.tradeType = wrapped.tradeType",
    "wrapped.trade = wrapped.trade",
    "wrapped.error = wrapped.error",
]

try {
    const packOutput = execFileSync(
        "npm",
        ["pack", "--json", "--pack-destination", temporaryRoot],
        { cwd: repository, encoding: "utf8", env: childEnvironment },
    )
    const [{ filename }] = JSON.parse(packOutput)
    const tarball = path.join(temporaryRoot, filename)

    const dacsConsumer = path.join(temporaryRoot, "dacs-consumer")
    await writeConsumer(
        dacsConsumer,
        [
            'import { Demos } from "@kynesyslabs/demosdk/websdk"',
            'import type { AutoInitOptions } from "@kynesyslabs/demosdk/tlsnotary/auto-init"',
            "",
            "type IsAny<Value> = 0 extends 1 & Value ? true : false",
            "type ExpectFalse<Value extends false> = Value",
            "type DemosMustNotBeAny = ExpectFalse<IsAny<typeof Demos>>",
            "",
            "const demosConstructor: typeof Demos = Demos",
            "void demosConstructor",
            "type _DemosMustNotBeAny = DemosMustNotBeAny",
            "",
            "const autoInitOptions: AutoInitOptions = {}",
            "void autoInitOptions",
            "// Resolve the default DACS consumer surface and every declaration",
            "// entrypoint touched by this repair. The Rubic-facing bridge type",
            "// surface is checked separately with its optional dependency present.",
            "type _PublicEntrypoints = [",
            ...typecheckedEntrypoints.map((entrypoint) => {
                const specifier = `@kynesyslabs/demosdk${entrypoint.slice(1)}`
                return `    typeof import(${JSON.stringify(specifier)}),`
            }),
            "]",
            "",
        ].join("\n"),
    )
    installConsumer(
        dacsConsumer,
        [tarball, "typescript@5.9.3", "@types/node@20.19.41"],
        ["--omit=optional"],
    )
    await assertPackageAbsent(dacsConsumer, "rubic-sdk")

    execFileSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            [
                `const entrypoints = ${JSON.stringify(runtimeEntrypoints.map(packageSpecifier))}`,
                "const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self')",
                "for (const entrypoint of entrypoints) { try { await import(entrypoint) } catch (error) { throw new Error(`failed to import ${entrypoint}`, { cause: error }) } }",
                "if (!hadSelf && Object.prototype.hasOwnProperty.call(globalThis, 'self')) throw new Error('package import created a browser self global')",
                "const sdk = await import('@kynesyslabs/demosdk')",
                "if (!sdk.tlsnotary || typeof sdk.tlsnotary.TLSNotary !== 'function') throw new Error('root did not export TLSNotary')",
                "const websdk = await import('@kynesyslabs/demosdk/websdk')",
                "if (typeof websdk.Demos !== 'function') throw new Error('websdk did not export Demos')",
                "const bridge = await import('@kynesyslabs/demosdk/bridge')",
                "if (typeof bridge.RubicBridge !== 'function') throw new Error('bridge did not export RubicBridge')",
                "const tlsnotary = await import('@kynesyslabs/demosdk/tlsnotary')",
                "for (const name of ['TLSNotary', 'TLSNotaryService', 'init', 'Prover', 'Presentation', 'NotaryServer', 'Transcript']) if (typeof tlsnotary[name] !== 'function') throw new Error(`tlsnotary did not export ${name}`)",
                "const tlsnotaryClient = new tlsnotary.TLSNotary({ notaryUrl: 'https://notary.example.test' })",
                "await tlsnotaryClient.initialize().then(() => { throw new Error('TLSNotary unexpectedly initialized in Node') }, error => { if (!/requires a browser or Web Worker runtime/u.test(String(error?.message))) throw error })",
                "const transcript = new tlsnotary.Transcript({ sent: [65, 0, 66], recv: [67, 0, 68] })",
                "if (transcript.sent('#') !== 'A#B' || transcript.recv('#') !== 'C#D') throw new Error('TLSNotary Transcript facade changed behavior')",
                "const notary = tlsnotary.NotaryServer.from('wss://notary.example.test/path')",
                "if (notary.url !== 'wss://notary.example.test/path' || notary.normalizeUrl() !== 'https://notary.example.test') throw new Error('TLSNotary NotaryServer facade changed behavior')",
                "const headers = tlsnotary.Prover.getHeaderMap('https://api.example.test/path', 'ok', { Accept: 'text/plain' })",
                "if (headers.get('Host')?.join(',') !== '97,112,105,46,101,120,97,109,112,108,101,46,116,101,115,116' || headers.get('Content-Length')?.join(',') !== '50') throw new Error('TLSNotary Prover header facade changed behavior')",
                "if (tlsnotary.Prover.getHeaderMap('https://api.example.test', null).get('Content-Length')?.join(',') !== '52') throw new Error('TLSNotary Prover null-body behavior changed')",
                "await tlsnotary.init().then(() => { throw new Error('TLSNotary init unexpectedly ran in Node') }, error => { if (!/require a browser or Web Worker runtime/u.test(String(error?.message))) throw error })",
                "const autoInit = await import('@kynesyslabs/demosdk/tlsnotary/auto-init')",
                "const wasmPath = autoInit.getWasmSourcePath()",
                "if (!wasmPath.endsWith('/tlsnotary/wasm')) throw new Error(`unexpected WASM path: ${wasmPath}`)",
                "const { stat } = await import('node:fs/promises')",
                "if (!(await stat(wasmPath)).isDirectory()) throw new Error(`missing packed WASM directory: ${wasmPath}`)",
                "const webpack = await import('@kynesyslabs/demosdk/tlsnotary/webpack')",
                "if (webpack.getTlsnWasmPath() !== wasmPath) throw new Error('TLSNotary path helpers disagree')",
            ].join(";"),
        ],
        { cwd: dacsConsumer, stdio: "inherit", env: childEnvironment },
    )
    typecheckConsumer(dacsConsumer)
    console.log(
        `packed-esm: dependency-free DACS consumer imported and typechecked on ${process.version}`,
    )

    // Keep the optional compatibility install independent of the no-optional
    // proof and release its large dependency tree before installing the next.
    await fs.rm(dacsConsumer, { recursive: true, force: true })

    const rubicConsumer = path.join(temporaryRoot, "rubic-consumer")
    await writeConsumer(
        rubicConsumer,
        [
            'import type { CrossChainTrade, RubicBridge, WrappedCrossChainTrade } from "@kynesyslabs/demosdk/bridge"',
            'import type { CrossChainTrade as NativeCrossChainTrade, WrappedCrossChainTrade as NativeWrappedCrossChainTrade } from "@kynesyslabs/demosdk/bridge/rubic"',
            "",
            "declare const trade: CrossChainTrade",
            "declare let wrapped: WrappedCrossChainTrade",
            "declare const nativeTrade: NativeCrossChainTrade",
            "declare const nativeWrapped: NativeWrappedCrossChainTrade",
            "type IsAny<Value> = 0 extends 1 & Value ? true : false",
            "type ExpectFalse<Value extends false> = Value",
            "type _DefaultTradeMustNotBeAny = ExpectFalse<IsAny<typeof trade>>",
            "type _DefaultWrappedMustNotBeAny = ExpectFalse<IsAny<typeof wrapped>>",
            "type _NativeTradeMustNotBeAny = ExpectFalse<IsAny<typeof nativeTrade>>",
            "type _NativeWrappedMustNotBeAny = ExpectFalse<IsAny<typeof nativeWrapped>>",
            ...compatibilityAssertions,
            "const defaultFromNative: CrossChainTrade = nativeTrade",
            "const nativeFromDefault: NativeCrossChainTrade = trade",
            "const defaultWrappedFromNative: WrappedCrossChainTrade = nativeWrapped",
            "const nativeWrappedFromDefault: NativeWrappedCrossChainTrade = wrapped",
            'const wirePayload: Parameters<RubicBridge["executeMockTrade"]>[2] = nativeWrapped',
            "void nativeTrade.needApprove()",
            "void nativeTrade.swap()",
            'void nativeTrade.encode({ fromAddress: "0x" })',
            "void defaultFromNative",
            "void nativeFromDefault",
            "void defaultWrappedFromNative",
            "void nativeWrappedFromDefault",
            "void wirePayload",
            "",
        ].join("\n"),
        // Rubic 5.57.4's transitive declaration graph contains known upstream
        // errors. This consumer still strictly checks its own compatibility
        // calls while avoiding failures inside unrelated third-party .d.ts.
        { skipLibCheck: true },
    )
    installConsumer(rubicConsumer, [
        tarball,
        "rubic-sdk@5.57.4",
        "typescript@5.9.3",
        "@types/node@20.19.41",
    ])
    await assertPackagePresent(rubicConsumer, "rubic-sdk")
    execFileSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            "const rubic = await import('@kynesyslabs/demosdk/bridge/rubic'); if (!rubic.BLOCKCHAIN_NAME || !rubic.CROSS_CHAIN_TRADE_TYPE) throw new Error('optional Rubic entrypoint did not expose its runtime API')",
        ],
        { cwd: rubicConsumer, stdio: "inherit", env: childEnvironment },
    )
    typecheckConsumer(rubicConsumer)
    console.log(
        `packed-esm: optional Rubic compatibility consumer typechecked on ${process.version}`,
    )
} finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
}
