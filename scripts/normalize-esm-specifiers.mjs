import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

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

async function rewriteSpecifiers(sourceFile, source) {
    const patterns = [
        /(\bfrom\s*)(["'])(\.[^"']*)(\2)/g,
        /(\bimport\s*)(["'])(\.[^"']*)(\2)/g,
        /(\bimport\s*\(\s*)(["'])(\.[^"']*)(\2)(\s*\))/g,
    ]

    let output = source
    let changes = 0

    for (const pattern of patterns) {
        const matches = [...output.matchAll(pattern)]
        for (const match of matches.reverse()) {
            const resolved = await resolveSpecifier(sourceFile, match[3])
            if (resolved === match[3]) continue

            const replacement = `${match[1]}${match[2]}${resolved}${match[4]}${match[5] ?? ""}`
            output = `${output.slice(0, match.index)}${replacement}${output.slice(match.index + match[0].length)}`
            changes += 1
        }
    }

    return { output, changes }
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

let changedFiles = 0
let changedSpecifiers = 0

for (const sourceFile of await collectFiles(buildRoot)) {
    const source = await readFile(sourceFile, "utf8")
    const { output, changes } = await rewriteSpecifiers(sourceFile, source)
    if (changes === 0) continue

    await writeFile(sourceFile, output)
    changedFiles += 1
    changedSpecifiers += changes
}

console.log(`Normalized ${changedSpecifiers} relative ESM specifiers in ${changedFiles} build files`)
