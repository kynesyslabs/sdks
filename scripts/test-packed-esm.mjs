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
const consumer = path.join(temporaryRoot, "consumer")
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
    "./bridge",
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

try {
    const packOutput = execFileSync(
        "npm",
        ["pack", "--json", "--pack-destination", temporaryRoot],
        { cwd: repository, encoding: "utf8", env: childEnvironment },
    )
    const [{ filename }] = JSON.parse(packOutput)
    const tarball = path.join(temporaryRoot, filename)

    await fs.mkdir(consumer)
    await fs.writeFile(
        path.join(consumer, "package.json"),
        `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
        "utf8",
    )
    await fs.writeFile(
        path.join(consumer, "consumer.ts"),
        [
            'import { Demos } from "@kynesyslabs/demosdk/websdk"',
            'import type { CrossChainTrade, WrappedCrossChainTrade } from "@kynesyslabs/demosdk/bridge"',
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
            "const wrappedTrade = { trade: null, tradeType: \"lifi\" } satisfies WrappedCrossChainTrade",
            "void wrappedTrade",
            "type _CrossChainTradeRemainsExported = CrossChainTrade",
            "",
            "// Resolve the default DACS consumer surface and every declaration",
            "// entrypoint touched by this repair. The Rubic-native subpath remains",
            "// opt-in because it deliberately requires the optional rubic-sdk.",
            "type _PublicEntrypoints = [",
            ...typecheckedEntrypoints.map((entrypoint) => {
                const specifier =
                    entrypoint === "."
                        ? "@kynesyslabs/demosdk"
                        : `@kynesyslabs/demosdk${entrypoint.slice(1)}`
                return `    typeof import(${JSON.stringify(specifier)}),`
            }),
            "]",
            "",
        ].join("\n"),
        "utf8",
    )
    await fs.writeFile(
        path.join(consumer, "tsconfig.json"),
        `${JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2022",
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    strict: true,
                    skipLibCheck: false,
                    noEmit: true,
                    types: ["node"],
                },
                include: ["consumer.ts"],
            },
            null,
            2,
        )}\n`,
        "utf8",
    )

    execFileSync(
        "npm",
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--omit=optional",
            tarball,
            "typescript@5.9.3",
            "@types/node@20.19.41",
        ],
        { cwd: consumer, stdio: "inherit", env: childEnvironment },
    )

    try {
        await fs.access(path.join(consumer, "node_modules", "rubic-sdk"))
        throw new Error(
            "packed-esm: rubic-sdk was installed despite --omit=optional",
        )
    } catch (error) {
        if (error?.code !== "ENOENT") throw error
    }

    execFileSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            "const sdk = await import('@kynesyslabs/demosdk/websdk'); if (typeof sdk.Demos !== 'function') throw new Error('websdk did not export Demos')",
        ],
        { cwd: consumer, stdio: "inherit", env: childEnvironment },
    )

    execFileSync(
        path.join(consumer, "node_modules", ".bin", "tsc"),
        ["--project", "tsconfig.json"],
        { cwd: consumer, stdio: "inherit", env: childEnvironment },
    )

    console.log(
        `packed-esm: @kynesyslabs/demosdk/websdk imported and typechecked successfully on ${process.version}`,
    )
} finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
}
