import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

/**
 * A direct dependency that no source imports still installs for every
 * consumer; a package imported without being declared resolves to whatever
 * version some transitive dependency happens to hoist.
 *
 * `web3` was used only by the removed TEN integration
 * (src/multichain/core/ten.ts). Other packages still pull web3 1.x in
 * transitively, so an import of it would resolve without a declaration.
 */
const ROOT = join(__dirname, "..", "..")
const SOURCE_DIRS = ["src", "scripts", "tests"]
const DEPENDENCY_FIELDS = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
]

function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "build") continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
            out.push(...sourceFiles(path))
        } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry)) {
            out.push(path)
        }
    }
    return out
}

function importersOf(name: string): string[] {
    const specifier = new RegExp(
        `(?:\\bfrom|\\bimport|\\brequire\\s*\\(|\\bimport\\s*\\()\\s*["']${name}["'/]`,
    )
    return SOURCE_DIRS.flatMap(dir => sourceFiles(join(ROOT, dir))).filter(file =>
        specifier.test(readFileSync(file, "utf8")),
    )
}

describe("direct dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))

    it.each(["web3"])("declares %s exactly when the sources import it", name => {
        const declared = DEPENDENCY_FIELDS.filter(field => name in (pkg[field] ?? {}))
        const importers = importersOf(name)
        if (importers.length === 0) {
            expect(declared).toEqual([])
        } else {
            expect(declared).not.toEqual([])
        }
    })

    it("finds imports in the sources it scans", () => {
        expect(importersOf("ethers").length).toBeGreaterThan(0)
    })
})
