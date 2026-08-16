#!/usr/bin/env node

import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import ts from "typescript"

const buildDirectory = path.resolve(process.argv[2] ?? "build")
const copiedVendorDirectories = new Set([
    path.join(buildDirectory, "tlsnotary", "wasm"),
])

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

async function isFile(filename) {
    try {
        return (await fs.stat(filename)).isFile()
    } catch (error) {
        if (error?.code === "ENOENT") return false
        throw error
    }
}

async function isDirectory(filename) {
    try {
        return (await fs.stat(filename)).isDirectory()
    } catch (error) {
        if (error?.code === "ENOENT") return false
        throw error
    }
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

    // Explicitly named files (including .js, .json and extensionless files)
    // are already valid Node ESM specifiers.
    if (await isFile(resolved)) return specifier

    // Declaration files refer to their runtime path with a .js suffix. A
    // type-only module may legitimately have a .d.ts file but no emitted JS.
    if (
        filename.endsWith(".d.ts") &&
        importPath.endsWith(".js") &&
        (await isFile(`${resolved.slice(0, -3)}.d.ts`))
    ) {
        return specifier
    }

    if (await isFile(`${resolved}.js`)) {
        return `${importPath}.js${suffix}`
    }

    if (filename.endsWith(".d.ts") && (await isFile(`${resolved}.d.ts`))) {
        return `${importPath}.js${suffix}`
    }

    if (await isDirectory(resolved)) {
        if (
            (await isFile(path.join(resolved, "index.js"))) ||
            (filename.endsWith(".d.ts") &&
                (await isFile(path.join(resolved, "index.d.ts"))))
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
        const entries = await fs.readdir(current, { withFileTypes: true })
        entries.sort((left, right) => left.name.localeCompare(right.name))

        for (const entry of entries) {
            const filename = path.join(current, entry.name)
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

async function rewriteFile(filename) {
    const source = await fs.readFile(filename, "utf8")
    const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith(".d.ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    )
    const replacements = []
    let localSpecifierCount = 0

    for (const node of moduleSpecifiers(sourceFile)) {
        if (!isRelativeSpecifier(node.text)) continue
        localSpecifierCount += 1

        const replacement = await resolveSpecifier(filename, node.text)
        if (replacement !== node.text) {
            replacements.push({
                start: node.getStart(sourceFile) + 1,
                end: node.getEnd() - 1,
                replacement,
            })
        }
    }

    if (replacements.length === 0) {
        return { changed: false, localSpecifierCount, replacementCount: 0 }
    }

    let output = source
    replacements.sort((left, right) => right.start - left.start)
    for (const replacement of replacements) {
        output =
            output.slice(0, replacement.start) +
            replacement.replacement +
            output.slice(replacement.end)
    }

    await fs.writeFile(filename, output, "utf8")
    return {
        changed: true,
        localSpecifierCount,
        replacementCount: replacements.length,
    }
}

let changedFiles = 0
let localSpecifiers = 0
let replacements = 0

for (const filename of await emittedModuleFiles(buildDirectory)) {
    const result = await rewriteFile(filename)
    if (result.changed) changedFiles += 1
    localSpecifiers += result.localSpecifierCount
    replacements += result.replacementCount
}

console.log(
    `fix-esm-imports: resolved ${replacements} specifier(s) in ${changedFiles} file(s); verified ${localSpecifiers} relative specifier(s)`,
)
