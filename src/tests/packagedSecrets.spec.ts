import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

/**
 * The published package is `build/` minus `build/tests` (package.json
 * `files`). A private key sat in `src/demoswork/utils/createTestWorkScript.ts`
 * — outside `tests/` — so it compiled into the package and was handed to
 * every consumer. This walks the source that ships and fails on a key-shaped
 * or mnemonic-shaped literal.
 */
const SRC_ROOT = join(__dirname, "..")
const NOT_SHIPPED = new Set(["tests", "archive"])

/** A quoted 64-hex string: an EVM private key, a seed, or a raw hash. */
const HEX64_LITERAL = /["'`](?:0x)?([0-9a-fA-F]{64})["'`]/g
/** Twelve or more lowercase words in one quoted string. */
const MNEMONIC_LITERAL = /["'`]([a-z]+(?:\s+[a-z]+){11,23})["'`]/g

/**
 * Constants that are hashes rather than credentials. A 64-hex literal that is
 * all zeroes is a placeholder address; anything else has to be justified here
 * by name so a new one cannot slip in unnoticed.
 */
const ALLOWED_HEX64 = new Set([
    "0".repeat(64),
    // The genesis transaction hash, the default argument of getTxByHash.
    "e25860ec6a7cccff0371091fed3a4c6839b1231ccec8cf2cb36eca3533af8f11",
])

function shippedSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
            if (NOT_SHIPPED.has(entry)) continue
            out.push(...shippedSourceFiles(path))
            continue
        }
        if (entry.endsWith(".ts")) out.push(path)
    }
    return out
}

function findAll(text: string, pattern: RegExp): string[] {
    return [...text.matchAll(pattern)].map(match => match[1])
}

describe("the published package carries no credentials", () => {
    const files = shippedSourceFiles(SRC_ROOT)

    it("walks a meaningful amount of source", () => {
        expect(files.length).toBeGreaterThan(50)
    })

    it("has no key-shaped literals", () => {
        const offenders: string[] = []
        for (const path of files) {
            const found = findAll(
                readFileSync(path, "utf8"),
                HEX64_LITERAL,
            ).filter(value => !ALLOWED_HEX64.has(value.toLowerCase()))
            if (found.length > 0) {
                offenders.push(`${relative(SRC_ROOT, path)}: ${found.length}`)
            }
        }

        expect(offenders).toEqual([])
    })

    it("has no mnemonic-shaped literals", () => {
        const offenders: string[] = []
        for (const path of files) {
            if (findAll(readFileSync(path, "utf8"), MNEMONIC_LITERAL).length) {
                offenders.push(relative(SRC_ROOT, path))
            }
        }

        expect(offenders).toEqual([])
    })
})
