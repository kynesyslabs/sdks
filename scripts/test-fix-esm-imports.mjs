#!/usr/bin/env node

import { decode, encode } from "@jridgewell/sourcemap-codec"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixer = path.join(repository, "scripts", "fix-esm-imports.mjs")
const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), "demosdk-esm-fixer-"))

function runFixer(buildDirectory) {
    return spawnSync(process.execPath, [fixer, path.basename(buildDirectory)], {
        cwd: path.dirname(buildDirectory),
        encoding: "utf8",
    })
}

try {
    const mappedBuild = path.join(temporaryRoot, "mapped-build")
    await fs.mkdir(mappedBuild)
    await fs.writeFile(
        path.join(mappedBuild, "index.js"),
        "export const value = 1\n",
        "utf8",
    )

    const firstLine = 'export { value } from ".";'
    const firstMappedColumn = firstLine.indexOf(";")
    const secondLine = 'export { value as queried } from "./?fixture";'
    const suffixColumn = secondLine.indexOf("?")
    const secondMappedColumn = secondLine.indexOf(";")
    const originalSource = `${firstLine}\n${secondLine}`
    const source = `${originalSource}\n//# sourceMappingURL=entry.js.map\n`
    const sourceMap = {
        version: 3,
        file: "entry.js",
        sourceRoot: "",
        sources: ["../src/entry.ts"],
        names: [],
        mappings: encode([
            [
                [0, 0, 0, 0],
                [firstMappedColumn, 0, 0, firstMappedColumn],
            ],
            [
                [0, 0, 1, 0],
                [suffixColumn, 0, 1, suffixColumn],
                [secondMappedColumn, 0, 1, secondMappedColumn],
            ],
        ]),
        sourcesContent: [originalSource],
    }
    await fs.writeFile(path.join(mappedBuild, "entry.js"), source, "utf8")
    await fs.writeFile(
        path.join(mappedBuild, "entry.js.map"),
        JSON.stringify(sourceMap),
        "utf8",
    )

    const mappedResult = runFixer(mappedBuild)
    assert.equal(mappedResult.status, 0, mappedResult.stderr)
    assert.match(mappedResult.stdout, /updated 1 source map/u)
    assert.match(
        await fs.readFile(path.join(mappedBuild, "entry.js"), "utf8"),
        /from "\.\/index\.js"/u,
    )
    assert.match(
        await fs.readFile(path.join(mappedBuild, "entry.js"), "utf8"),
        /from "\.\/index\.js\?fixture"/u,
    )
    const rewrittenMap = JSON.parse(
        await fs.readFile(path.join(mappedBuild, "entry.js.map"), "utf8"),
    )
    const rewrittenMappings = decode(rewrittenMap.mappings)
    assert.equal(
        rewrittenMappings[0][1][0],
        firstMappedColumn + ("./index.js".length - ".".length),
    )
    assert.equal(
        rewrittenMappings[1][1][0],
        suffixColumn + ("./index.js".length - "./".length),
    )
    assert.equal(
        rewrittenMappings[1][2][0],
        secondMappedColumn + ("./index.js".length - "./".length),
    )
    assert.deepEqual(rewrittenMap.sourcesContent, [originalSource])

    const rewrittenSource = await fs.readFile(
        path.join(mappedBuild, "entry.js"),
        "utf8",
    )
    const rewrittenMapText = await fs.readFile(
        path.join(mappedBuild, "entry.js.map"),
        "utf8",
    )
    const idempotentResult = runFixer(mappedBuild)
    assert.equal(idempotentResult.status, 0, idempotentResult.stderr)
    assert.match(idempotentResult.stdout, /resolved 0 specifier/u)
    assert.equal(
        await fs.readFile(path.join(mappedBuild, "entry.js"), "utf8"),
        rewrittenSource,
    )
    assert.equal(
        await fs.readFile(path.join(mappedBuild, "entry.js.map"), "utf8"),
        rewrittenMapText,
    )

    const containmentRoot = path.join(temporaryRoot, "containment")
    const containedBuild = path.join(containmentRoot, "build")
    await fs.mkdir(containedBuild, { recursive: true })
    await fs.writeFile(
        path.join(containedBuild, "target.js"),
        "export const target = true\n",
        "utf8",
    )
    const validSource = 'export { target } from "./target"\n'
    const validFile = path.join(containedBuild, "a-valid.js")
    await fs.writeFile(validFile, validSource, "utf8")
    await fs.writeFile(
        path.join(containmentRoot, "outside.js"),
        "export const outside = true\n",
        "utf8",
    )
    const escapingSource = 'export { outside } from "../outside.js"\n'
    const escapingFile = path.join(containedBuild, "z-escape.js")
    await fs.writeFile(escapingFile, escapingSource, "utf8")

    const containmentResult = runFixer(containedBuild)
    assert.notEqual(containmentResult.status, 0)
    assert.match(
        `${containmentResult.stdout}\n${containmentResult.stderr}`,
        /escapes canonical build directory/u,
    )
    assert.equal(await fs.readFile(validFile, "utf8"), validSource)
    assert.equal(await fs.readFile(escapingFile, "utf8"), escapingSource)

    const symlinkBuild = path.join(temporaryRoot, "symlink-build")
    await fs.mkdir(symlinkBuild)
    await fs.symlink(
        path.join(containmentRoot, "outside.js"),
        path.join(symlinkBuild, "outside-link.js"),
    )
    const symlinkResult = runFixer(symlinkBuild)
    assert.notEqual(symlinkResult.status, 0)
    assert.match(
        `${symlinkResult.stdout}\n${symlinkResult.stderr}`,
        /Refusing to traverse symbolic link/u,
    )

    const escapedBuild = path.join(temporaryRoot, "escaped-build")
    await fs.mkdir(escapedBuild)
    await fs.writeFile(
        path.join(escapedBuild, "target.js"),
        "export const target = true\n",
        "utf8",
    )
    const escapedSource = 'export { target } from "./\\u0074arget"\n'
    const escapedFile = path.join(escapedBuild, "escaped.js")
    await fs.writeFile(escapedFile, escapedSource, "utf8")
    const escapedResult = runFixer(escapedBuild)
    assert.notEqual(escapedResult.status, 0)
    assert.match(
        `${escapedResult.stdout}\n${escapedResult.stderr}`,
        /Cannot safely rewrite escaped module specifier/u,
    )
    assert.equal(await fs.readFile(escapedFile, "utf8"), escapedSource)

    const outsideInvocation = spawnSync(process.execPath, [fixer, mappedBuild], {
        cwd: repository,
        encoding: "utf8",
    })
    assert.notEqual(outsideInvocation.status, 0)
    assert.match(
        `${outsideInvocation.stdout}\n${outsideInvocation.stderr}`,
        /Build path must be a child of the invocation directory/u,
    )

    console.log(
        `fix-esm-imports: containment and source-map regressions passed on ${process.version}`,
    )
} finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
}
