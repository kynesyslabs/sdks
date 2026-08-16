#!/usr/bin/env node

import { decode, encode } from "@jridgewell/sourcemap-codec"
import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import ts from "typescript"

const invocationInputDirectory = path.resolve(process.cwd())
const requestedBuildDirectory = path.resolve(
    invocationInputDirectory,
    process.argv[2] ?? "build",
)

function isInside(root, filename) {
    const relative = path.relative(root, filename)
    return (
        relative === "" ||
        (relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative))
    )
}

if (
    requestedBuildDirectory === invocationInputDirectory ||
    !isInside(invocationInputDirectory, requestedBuildDirectory)
) {
    throw new Error(
        `Build path must be a child of the invocation directory: ${requestedBuildDirectory}`,
    )
}
const invocationDirectory = await fs.realpath(invocationInputDirectory)
const buildDirectory = await fs.realpath(requestedBuildDirectory)
if (!(await fs.stat(buildDirectory)).isDirectory()) {
    throw new Error(`Build path is not a directory: ${requestedBuildDirectory}`)
}
if (!isInside(invocationDirectory, buildDirectory)) {
    throw new Error(
        `Canonical build path escapes the invocation directory: ${buildDirectory}`,
    )
}

const copiedVendorDirectories = new Set([
    path.join(buildDirectory, "tlsnotary", "wasm"),
])

function isInsideBuild(filename) {
    return isInside(buildDirectory, filename)
}

function assertInsideBuild(filename, description) {
    if (!isInsideBuild(filename)) {
        throw new Error(
            `${description} escapes canonical build directory: ${filename}`,
        )
    }
}

async function assertCanonicalTargetInsideBuild(filename, description) {
    const canonical = await fs.realpath(filename)
    assertInsideBuild(canonical, description)
}

function isRelativeSpecifier(specifier) {
    return (
        specifier === "." ||
        specifier === ".." ||
        specifier.startsWith("./") ||
        specifier.startsWith("../")
    )
}

function splitSpecifier(specifier) {
    const suffixIndex = specifier.search(/[?#]/u)
    if (suffixIndex === -1) {
        return { pathname: specifier, suffix: "" }
    }

    return {
        pathname: specifier.slice(0, suffixIndex),
        suffix: specifier.slice(suffixIndex),
    }
}

async function isFile(filename, description = "Relative import target") {
    assertInsideBuild(filename, description)
    try {
        const stats = await fs.stat(filename)
        if (!stats.isFile()) return false
        await assertCanonicalTargetInsideBuild(filename, description)
        return true
    } catch (error) {
        if (error?.code === "ENOENT") return false
        throw error
    }
}

async function isDirectory(filename, description = "Relative import target") {
    assertInsideBuild(filename, description)
    try {
        const stats = await fs.stat(filename)
        if (!stats.isDirectory()) return false
        await assertCanonicalTargetInsideBuild(filename, description)
        return true
    } catch (error) {
        if (error?.code === "ENOENT") return false
        throw error
    }
}

async function isContainedFile(filename, description) {
    if (!isInsideBuild(filename)) return false
    return await isFile(filename, description)
}

function appendIndex(pathname) {
    if (pathname === ".") return "./index.js"
    if (pathname === "..") return "../index.js"
    return `${pathname.replace(/\/$/u, "")}/index.js`
}

async function resolveSpecifier(filename, specifier) {
    if (!isRelativeSpecifier(specifier)) return specifier

    const { pathname: importPath, suffix } = splitSpecifier(specifier)
    const resolved = path.resolve(path.dirname(filename), importPath)
    const description = `Relative import ${JSON.stringify(specifier)} from ${path.relative(buildDirectory, filename)}`
    assertInsideBuild(resolved, description)

    // Explicitly named files (including .js, .json and extensionless files)
    // are already valid Node ESM specifiers.
    if (await isFile(resolved, description)) return specifier

    // Declaration files refer to their runtime path with a .js suffix. A
    // type-only module may legitimately have a .d.ts file but no emitted JS.
    if (
        filename.endsWith(".d.ts") &&
        importPath.endsWith(".js") &&
        (await isContainedFile(`${resolved.slice(0, -3)}.d.ts`, description))
    ) {
        return specifier
    }

    if (await isContainedFile(`${resolved}.js`, description)) {
        return `${importPath}.js${suffix}`
    }

    if (
        filename.endsWith(".d.ts") &&
        (await isContainedFile(`${resolved}.d.ts`, description))
    ) {
        return `${importPath}.js${suffix}`
    }

    if (await isDirectory(resolved, description)) {
        if (
            (await isFile(path.join(resolved, "index.js"), description)) ||
            (filename.endsWith(".d.ts") &&
                (await isFile(
                    path.join(resolved, "index.d.ts"),
                    description,
                )))
        ) {
            return `${appendIndex(importPath)}${suffix}`
        }
    }

    throw new Error(
        `Cannot resolve relative ESM specifier ${JSON.stringify(specifier)} in ${path.relative(process.cwd(), filename)}`,
    )
}

function moduleSpecifiers(sourceFile) {
    const found = []

    function add(node) {
        if (node && ts.isStringLiteralLike(node)) {
            found.push(node)
        }
    }

    function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            add(node.moduleSpecifier)
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
            add(node.arguments[0])
        } else if (ts.isImportTypeNode(node)) {
            if (ts.isLiteralTypeNode(node.argument)) add(node.argument.literal)
        }

        ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return found
}

async function emittedModuleFiles(directory) {
    const files = []

    async function walk(current) {
        assertInsideBuild(current, "Build traversal")
        const entries = await fs.readdir(current, { withFileTypes: true })
        entries.sort((left, right) => left.name.localeCompare(right.name))

        for (const entry of entries) {
            const filename = path.join(current, entry.name)
            if (entry.isSymbolicLink()) {
                throw new Error(
                    `Refusing to traverse symbolic link in build output: ${filename}`,
                )
            }
            if (entry.isDirectory()) {
                // build:copy-wasm copies third-party artifacts after TypeScript
                // emits the SDK. Their internal layout belongs to tlsn-js and
                // must not be rewritten or validated as SDK output.
                if (copiedVendorDirectories.has(filename)) continue
                await walk(filename)
            } else if (entry.isFile() && /(?:\.js|\.d\.ts)$/u.test(entry.name)) {
                files.push(filename)
            }
        }
    }

    await walk(directory)
    return files
}

function sourceMapReference(source) {
    const trimmedSource = source.trimEnd()
    const lineStart = Math.max(
        trimmedSource.lastIndexOf("\n"),
        trimmedSource.lastIndexOf("\r"),
    )
    const lastLine = trimmedSource.slice(lineStart + 1).trim()
    if (!lastLine.startsWith("//#") && !lastLine.startsWith("//@")) {
        return undefined
    }

    const directive = lastLine.slice(3).trimStart()
    const marker = "sourceMappingURL="
    return directive.startsWith(marker)
        ? directive.slice(marker.length).trim()
        : undefined
}

function sourceMapShift(filename, sourceFile, replacement) {
    const start = sourceFile.getLineAndCharacterOfPosition(replacement.start)
    const end = sourceFile.getLineAndCharacterOfPosition(replacement.end)
    if (start.line !== end.line || /[\r\n]/u.test(replacement.replacement)) {
        throw new Error(`Cannot safely update multiline source map for ${filename}`)
    }

    const delta = replacement.replacement.length - replacement.original.length
    if (delta <= 0) {
        throw new Error(
            `ESM rewrite is not a source-map-safe insertion in ${filename}`,
        )
    }

    let insertionOffset = 0
    while (
        insertionOffset < replacement.original.length &&
        replacement.original[insertionOffset] ===
            replacement.replacement[insertionOffset]
    ) {
        insertionOffset += 1
    }
    if (
        replacement.replacement.slice(insertionOffset + delta) !==
        replacement.original.slice(insertionOffset)
    ) {
        throw new Error(
            `ESM rewrite is not a source-map-safe insertion in ${filename}`,
        )
    }

    return {
        line: end.line,
        fromColumn: start.character + insertionOffset,
        delta,
    }
}

function applySourceMapShifts(decodedMappings, shiftsByLine) {
    for (const [lineNumber, shifts] of shiftsByLine) {
        shifts.sort((left, right) => left.fromColumn - right.fromColumn)
        const line = decodedMappings[lineNumber] ?? []
        for (const segment of line) {
            const originalColumn = segment[0]
            segment[0] += shifts
                .filter((shift) => originalColumn >= shift.fromColumn)
                .reduce((total, shift) => total + shift.delta, 0)
        }
    }
}

async function rewriteSourceMap(filename, sourceFile, source, replacements) {
    if (!filename.endsWith(".js")) return undefined

    const reference = sourceMapReference(source)
    const defaultMapFilename = `${filename}.map`
    const defaultMapExists = await isFile(
        defaultMapFilename,
        "Generated source map",
    )

    if (!reference) {
        if (defaultMapExists) {
            throw new Error(
                `Generated source map has no sourceMappingURL: ${defaultMapFilename}`,
            )
        }
        return undefined
    }
    if (/^(?:data:|[a-z][a-z\d+.-]*:|\/)/iu.test(reference)) {
        throw new Error(`Unsupported sourceMappingURL in ${filename}: ${reference}`)
    }
    if (/[?#]/u.test(reference)) {
        throw new Error(
            `Source-map query/hash suffix is not supported in ${filename}: ${reference}`,
        )
    }

    const mapFilename = path.resolve(
        path.dirname(filename),
        decodeURIComponent(reference),
    )
    assertInsideBuild(mapFilename, "Generated source map")
    if (!(await isFile(mapFilename, "Generated source map"))) {
        throw new Error(`Missing generated source map: ${mapFilename}`)
    }
    if (path.normalize(mapFilename) !== path.normalize(defaultMapFilename)) {
        throw new Error(
            `Unexpected source map reference in ${filename}: ${reference}`,
        )
    }

    const rawMap = await fs.readFile(mapFilename, "utf8")
    const sourceMap = JSON.parse(rawMap)
    if (sourceMap.version !== 3 || typeof sourceMap.mappings !== "string") {
        throw new Error(`Unsupported source-map format: ${mapFilename}`)
    }

    const shiftsByLine = new Map()
    for (const replacement of replacements) {
        const shift = sourceMapShift(filename, sourceFile, replacement)
        const shifts = shiftsByLine.get(shift.line) ?? []
        shifts.push({
            fromColumn: shift.fromColumn,
            delta: shift.delta,
        })
        shiftsByLine.set(shift.line, shifts)
    }

    const decodedMappings = decode(sourceMap.mappings).map((line) =>
        line.map((segment) => [...segment]),
    )
    applySourceMapShifts(decodedMappings, shiftsByLine)

    sourceMap.mappings = encode(decodedMappings)
    return {
        filename: mapFilename,
        contents: `${JSON.stringify(sourceMap)}${rawMap.endsWith("\n") ? "\n" : ""}`,
    }
}

async function prepareFileRewrite(filename) {
    const source = await fs.readFile(filename, "utf8")
    const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith(".d.ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    )
    if (sourceFile.parseDiagnostics.length > 0) {
        const diagnostic = sourceFile.parseDiagnostics[0]
        throw new Error(
            `Cannot safely parse ${filename}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
        )
    }
    const replacements = []
    let localSpecifierCount = 0

    for (const node of moduleSpecifiers(sourceFile)) {
        if (!isRelativeSpecifier(node.text)) continue
        localSpecifierCount += 1

        const replacement = await resolveSpecifier(filename, node.text)
        if (replacement !== node.text) {
            const start = node.getStart(sourceFile) + 1
            const end = node.getEnd() - 1
            const original = source.slice(start, end)
            if (original !== node.text) {
                throw new Error(
                    `Cannot safely rewrite escaped module specifier in ${filename}`,
                )
            }
            replacements.push({
                start,
                end,
                original,
                replacement,
            })
        }
    }

    if (replacements.length === 0) {
        return {
            changed: false,
            localSpecifierCount,
            replacementCount: 0,
            sourceMapChanged: false,
            writes: [],
        }
    }

    const sourceMap = await rewriteSourceMap(
        filename,
        sourceFile,
        source,
        replacements,
    )
    let output = source
    replacements.sort((left, right) => right.start - left.start)
    for (const replacement of replacements) {
        output =
            output.slice(0, replacement.start) +
            replacement.replacement +
            output.slice(replacement.end)
    }

    const writes = [{ filename, contents: output }]
    if (sourceMap) {
        writes.push(sourceMap)
    }
    return {
        changed: true,
        localSpecifierCount,
        replacementCount: replacements.length,
        sourceMapChanged: sourceMap !== undefined,
        writes,
    }
}

let changedFiles = 0
let changedSourceMaps = 0
let localSpecifiers = 0
let replacements = 0
const pendingWrites = []
const writeTargets = new Set()

for (const filename of await emittedModuleFiles(buildDirectory)) {
    const result = await prepareFileRewrite(filename)
    if (result.changed) changedFiles += 1
    if (result.sourceMapChanged) changedSourceMaps += 1
    localSpecifiers += result.localSpecifierCount
    replacements += result.replacementCount
    for (const write of result.writes) {
        if (writeTargets.has(write.filename)) {
            throw new Error(`Refusing duplicate generated write: ${write.filename}`)
        }
        writeTargets.add(write.filename)
        pendingWrites.push(write)
    }
}

// Validate the complete output graph before mutating it. A late unresolved or
// escaping import therefore cannot leave earlier generated files half-fixed.
await Promise.all(
    pendingWrites.map(({ filename, contents }) =>
        fs.writeFile(filename, contents, "utf8"),
    ),
)

console.log(
    `fix-esm-imports: resolved ${replacements} specifier(s) in ${changedFiles} file(s); updated ${changedSourceMaps} source map(s); verified ${localSpecifiers} relative specifier(s)`,
)
