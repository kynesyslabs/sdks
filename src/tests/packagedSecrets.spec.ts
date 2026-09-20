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
 * This SDK signs for chains whose keys are not 64-hex, and a secret in one of
 * their formats would have sailed past the two patterns above. Base58 here is
 * the Bitcoin alphabet — no 0, O, I or l — which is also what XRP and Solana
 * encode with.
 */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]"
/** An XRP family seed: `s` followed by 28 base58 characters. */
const XRP_SEED_LITERAL = new RegExp(`["'\`](s${BASE58}{28})["'\`]`, "g")
/** A Solana secret key: 64 bytes, base58, 86-88 characters. */
const SOLANA_SECRET_LITERAL = new RegExp(`["'\`](${BASE58}{86,88})["'\`]`, "g")
/** A Bitcoin WIF key: `5` uncompressed, `K` or `L` compressed. */
const BITCOIN_WIF_LITERAL = new RegExp(
    `["'\`]([5KL]${BASE58}{50,51})["'\`]`,
    "g",
)

/**
 * Shannon entropy per character.
 *
 * The base58 patterns match on shape alone, and plenty of ordinary
 * identifiers are the right shape — `storageProgramConfiguration` is 28
 * characters of base58 after an `s`. A key is encoded random bytes and an
 * identifier is not, so the two separate cleanly on entropy, and this keeps
 * the guard from crying wolf until someone stops believing it.
 */
function entropyPerChar(value: string): number {
    const counts = new Map<string, number>()
    for (const char of value) {
        counts.set(char, (counts.get(char) ?? 0) + 1)
    }
    let bits = 0
    for (const count of counts.values()) {
        const p = count / value.length
        bits -= p * Math.log2(p)
    }
    return bits
}

/** Random enough to be an encoded key rather than a name. */
export function looksLikeEncodedKey(value: string): boolean {
    return entropyPerChar(value) >= 4
}

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

    it("has no base58 key literals from the other chains this SDK signs for", () => {
        // XRP seeds, Solana secret keys and Bitcoin WIF keys are all base58,
        // so none of them would have shown up in a 64-hex search.
        const patterns: [string, RegExp][] = [
            ["XRP seed", XRP_SEED_LITERAL],
            ["Solana secret key", SOLANA_SECRET_LITERAL],
            ["Bitcoin WIF", BITCOIN_WIF_LITERAL],
        ]
        const offenders: string[] = []

        for (const path of files) {
            const text = readFileSync(path, "utf8")
            for (const [label, pattern] of patterns) {
                const found = findAll(text, pattern).filter(
                    looksLikeEncodedKey,
                )
                if (found.length > 0) {
                    offenders.push(
                        `${relative(SRC_ROOT, path)}: ${label} x${found.length}`,
                    )
                }
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

/**
 * A guard nobody has watched fail is not a guard. These are published test
 * vectors, and they live under `tests/`, which the package does not ship.
 */
describe("the guard catches what it claims to", () => {
    const planted: [string, RegExp, string][] = [
        [
            "XRP seed",
            XRP_SEED_LITERAL,
            `const seed = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb"`,
        ],
        [
            "Bitcoin WIF",
            BITCOIN_WIF_LITERAL,
            `const wif = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ"`,
        ],
        [
            "Solana secret key",
            SOLANA_SECRET_LITERAL,
            `const key = "${"4wBqpZM9xaSheZzJSMawUHDgZ7miWfSsxmfVF5jJpYP".repeat(2)}"`,
        ],
    ]

    it.each(planted)("finds a planted %s", (_label, pattern, source) => {
        const found = findAll(source, pattern)

        expect(found).toHaveLength(1)
        // The base58 patterns match on shape, so the entropy filter has to
        // agree or a real key would be filtered back out.
        expect(looksLikeEncodedKey(found[0])).toBe(true)
    })

    it("finds a planted EVM private key", () => {
        // Hex carries at most 4 bits per character, so this one is matched on
        // shape alone and never passes through the entropy filter.
        const source = `const pk = "0x4c0883a69102937d6231471b5dbb6204fe512961708279a5b9d5b48a1a0f4b1c"`

        expect(findAll(source, HEX64_LITERAL)).toHaveLength(1)
    })

    it("does not fire on ordinary identifiers of the same shape", () => {
        const source = `
            const a = "storageProgramConfiguration"
            const b = "subscriptionManagerReference"
        `

        const flagged = findAll(source, XRP_SEED_LITERAL).filter(
            looksLikeEncodedKey,
        )

        expect(flagged).toEqual([])
    })
})
