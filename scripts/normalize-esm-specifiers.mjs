import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { decode, encode } from "@jridgewell/sourcemap-codec"
import ts from "typescript"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildRoot = path.join(repositoryRoot, "build")

async function existsAsFile(candidate) {
    try {
        return (await stat(candidate)).isFile()
    } catch (error) {
        if (error?.code === "ENOENT") return false
        throw error
    }
}

async function resolveSpecifier(sourceFile, specifier) {
    if (!specifier.startsWith(".")) return specifier

    const absolute = path.resolve(path.dirname(sourceFile), specifier)

    if (await existsAsFile(absolute)) return specifier
    if (await existsAsFile(`${absolute}.js`)) return `${specifier}.js`
    if (await existsAsFile(path.join(absolute, "index.js"))) {
        return `${specifier.replace(/\/$/, "")}/index.js`
    }

    return specifier
}

// Module specifiers in code positions only (as in #121's fix-esm-imports.mjs):
// import/export-from declarations, side-effect imports, import() calls and
// declaration `import("...")` types. Strings, comments and template text that
// merely look like imports are data and stay byte for byte.
function specifierLiterals(ast, source) {
    const literals = []
    const visit = node => {
        let literal
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier
        else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            literal = node.arguments[0]
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
            literal = node.argument.literal
        }
        if (literal && ts.isStringLiteral(literal)) {
            const start = literal.getStart(ast) + 1
            const end = literal.end - 1
            // Only rewrite plain literals whose source text is the specifier.
            if (source.slice(start, end) === literal.text) literals.push({ start, end, specifier: literal.text })
        }
        ts.forEachChild(node, visit)
    }
    visit(ast)
    return literals
}

// tsc writes `//# sourceMappingURL=<name>.map` as the last line of each file it
// maps, next to the file. A rewrite only appends to a specifier, so every
// mapping after the insertion point on that generated line moves right by the
// inserted length. The build only ever runs this on fresh tsc output, so any
// other map layout means the output is not what we think it is: fail before
// writing rather than ship a stale map.
const MAP_URL = /^\/\/[#@] sourceMappingURL=(.*)$/

async function shiftSourceMap(sourceFile, source, ast, insertions) {
    const mapFile = `${sourceFile}.map`
    const lastLine = source.trimEnd().split(/\r?\n/).pop()
    const reference = MAP_URL.exec(lastLine)?.[1]
    const hasMap = await existsAsFile(mapFile)
    if (reference === undefined && !hasMap) return undefined
    if (reference !== path.basename(mapFile)) {
        throw new Error(`${sourceFile}: expected sourceMappingURL=${path.basename(mapFile)}, found ${reference ?? "none"}`)
    }
    if (!hasMap) throw new Error(`${sourceFile}: source map ${mapFile} is missing`)

    const raw = await readFile(mapFile, "utf8")
    let map
    try {
        map = JSON.parse(raw)
    } catch (error) {
        throw new Error(`${mapFile}: not valid JSON (${error.message})`)
    }
    if (map.version !== 3 || typeof map.mappings !== "string") throw new Error(`${mapFile}: not a version 3 source map`)

    const lines = decode(map.mappings)
    for (const { position, length } of insertions) {
        const { line, character } = ast.getLineAndCharacterOfPosition(position)
        for (const segment of lines[line] ?? []) {
            if (segment[0] >= character) segment[0] += length
        }
    }
    map.mappings = encode(lines)
    return { mapFile, output: `${JSON.stringify(map)}${raw.endsWith("\n") ? "\n" : ""}` }
}

async function rewriteSpecifiers(sourceFile, source) {
    const scriptKind = sourceFile.endsWith(".d.ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS
    const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, false, scriptKind)
    let output = source
    const insertions = []

    for (const { start, end, specifier } of specifierLiterals(ast, source).sort((a, b) => b.start - a.start)) {
        const resolved = await resolveSpecifier(sourceFile, specifier)
        if (resolved === specifier) continue
        if (!resolved.startsWith(specifier)) throw new Error(`Rewrite of ${specifier} in ${sourceFile} is not an append`)

        output = `${output.slice(0, start)}${resolved}${output.slice(end)}`
        insertions.push({ position: end, length: resolved.length - specifier.length })
    }
    if (insertions.length === 0) return { output, changes: 0 }
    // Files that need no rewrite are never judged, so reruns and vendored
    // files copied in later stay untouched. A file we do rewrite must parse.
    if (ast.parseDiagnostics.length > 0) {
        const { line } = ast.getLineAndCharacterOfPosition(ast.parseDiagnostics[0].start)
        throw new Error(`${sourceFile}:${line + 1}: cannot parse, refusing to rewrite`)
    }

    const sourceMap = await shiftSourceMap(sourceFile, source, ast, insertions)
    return { output, changes: insertions.length, sourceMap }
}

async function collectFiles(directory) {
    const files = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) files.push(...await collectFiles(absolute))
        else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))) {
            files.push(absolute)
        }
    }
    return files
}

// Check every file before writing any, so a refusal leaves the build as tsc left it.
const rewrites = []
for (const sourceFile of await collectFiles(buildRoot)) {
    const result = await rewriteSpecifiers(sourceFile, await readFile(sourceFile, "utf8"))
    if (result.changes > 0) rewrites.push({ sourceFile, ...result })
}

let changedSpecifiers = 0
let changedSourceMaps = 0
for (const { sourceFile, output, changes, sourceMap } of rewrites) {
    await writeFile(sourceFile, output)
    if (sourceMap) {
        await writeFile(sourceMap.mapFile, sourceMap.output)
        changedSourceMaps += 1
    }
    changedSpecifiers += changes
}

console.log(`Normalized ${changedSpecifiers} relative ESM specifiers in ${rewrites.length} build files`)
console.log(`Shifted ${changedSourceMaps} source maps`)
