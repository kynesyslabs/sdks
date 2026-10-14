import { readFileSync } from "fs"
import { join } from "path"
import {
    normaliseNotaryKey,
    notaryKeyMatches,
    NotaryKeyMismatchError,
} from "@/tlsnotary/notaryKey"

/**
 * `verify()` read both the notary key it trusts and the key carried by the
 * presentation, and compared neither. A presentation notarised by whoever
 * produced it therefore verified like one from the configured notary.
 */
const NOTARY_KEY = "ab".repeat(32)
const OTHER_KEY = "cd".repeat(32)

/** A DER/SPKI wrapper around the same raw key bytes. */
const DER_PREFIX = "302a300506032b6570032100"
const PEM_FOR_NOTARY = [
    "-----BEGIN PUBLIC KEY-----",
    Buffer.from(DER_PREFIX + NOTARY_KEY, "hex").toString("base64"),
    "-----END PUBLIC KEY-----",
].join("\n")

describe("normaliseNotaryKey", () => {
    it("accepts hex with or without the prefix", () => {
        expect(normaliseNotaryKey(`0x${NOTARY_KEY}`)).toBe(NOTARY_KEY)
        expect(normaliseNotaryKey(NOTARY_KEY.toUpperCase())).toBe(NOTARY_KEY)
    })

    it("unwraps a PEM encoding to its bytes", () => {
        expect(normaliseNotaryKey(PEM_FOR_NOTARY)).toContain(NOTARY_KEY)
    })

    it("returns null for text that is neither", () => {
        expect(normaliseNotaryKey("not a key")).toBeNull()
        expect(normaliseNotaryKey("")).toBeNull()
    })
})

describe("notaryKeyMatches", () => {
    it("matches the same key", () => {
        expect(notaryKeyMatches(NOTARY_KEY, NOTARY_KEY)).toBe(true)
    })

    it("matches a PEM-configured key against the presentation's raw bytes", () => {
        expect(notaryKeyMatches(NOTARY_KEY, PEM_FOR_NOTARY)).toBe(true)
    })

    it("refuses a presentation signed by another notary", () => {
        expect(notaryKeyMatches(OTHER_KEY, NOTARY_KEY)).toBe(false)
        expect(notaryKeyMatches(OTHER_KEY, PEM_FOR_NOTARY)).toBe(false)
    })

    it("refuses when either side is unreadable", () => {
        expect(notaryKeyMatches(NOTARY_KEY, "not a key")).toBe(false)
        expect(notaryKeyMatches("N/A", NOTARY_KEY)).toBe(false)
    })

    it("does not accept a key that merely contains the other", () => {
        // endsWith is only allowed for a longer ENCODING of the same bytes,
        // never for a shorter presentation key hiding inside a longer one.
        expect(notaryKeyMatches(NOTARY_KEY + "ee", NOTARY_KEY)).toBe(false)
    })
})

describe("NotaryKeyMismatchError", () => {
    it("names both keys without dumping them whole", () => {
        const error = new NotaryKeyMismatchError(OTHER_KEY, NOTARY_KEY)

        expect(error.presentationKey).toBe(OTHER_KEY)
        expect(error.expectedKey).toBe(NOTARY_KEY)
        expect(error.message).toContain("different notary")
    })
})

describe("the mismatch error reaches consumers", () => {
    /**
     * `verify()` throws this, so an application has to be able to tell
     * "signed by a notary you do not trust" apart from a malformed proof.
     * Without the re-export the only way to do that was to match on the
     * message, which is not a contract anyone should depend on.
     */
    it("is re-exported from the tlsnotary entry point", () => {
        // Read rather than imported: the entry point pulls in the tlsn-js
        // WASM bundle, which needs a browser to load. The export line is what
        // the package contract rests on, so that is what this pins.
        const entryPoint = readFileSync(
            join(__dirname, "..", "tlsnotary", "index.ts"),
            "utf8",
        )

        expect(entryPoint).toMatch(
            /export\s*\{[^}]*NotaryKeyMismatchError[^}]*\}\s*from\s*["']\.\/notaryKey["']/,
        )
    })

    it("survives an instanceof check", () => {
        const error = new NotaryKeyMismatchError("ab".repeat(32), "cd".repeat(32))

        expect(error).toBeInstanceOf(NotaryKeyMismatchError)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe("NotaryKeyMismatchError")
    })
})
