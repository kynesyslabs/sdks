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

    execFileSync(
        "npm",
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            tarball,
        ],
        { cwd: consumer, stdio: "inherit", env: childEnvironment },
    )

    execFileSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            "const sdk = await import('@kynesyslabs/demosdk/websdk'); if (typeof sdk.Demos !== 'function') throw new Error('websdk did not export Demos')",
        ],
        { cwd: consumer, stdio: "inherit", env: childEnvironment },
    )

    console.log(
        `packed-esm: @kynesyslabs/demosdk/websdk imported successfully on ${process.version}`,
    )
} finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
}
