import { readFileSync } from "fs"
import { join } from "path"
import {
    checkNotaryKey,
    normaliseNotaryKey,
    notaryKeyMatches,
    NotaryKeyMismatchError,
} from "@/tlsnotary/notaryKey"
import {
    isTlsnPlaceholder,
    resolveNotary,
    TLSN_DEFAULT_MAX_PRESENTATION_BYTES,
    TLSN_MAINNET_CHAIN_ID,
    TLSN_MAINNET_NOTARY_KEYS,
    TLSN_MAINNET_NOTARY_URL,
} from "@/tlsnotary/network"

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

describe("checkNotaryKey", () => {
    it("returns the trusted key the presentation was signed with", () => {
        expect(checkNotaryKey(NOTARY_KEY, [OTHER_KEY, NOTARY_KEY])).toBe(NOTARY_KEY)
        expect(checkNotaryKey(NOTARY_KEY, [PEM_FOR_NOTARY])).toBe(PEM_FOR_NOTARY)
    })

    it("refuses a foreign key, and refuses everything when nothing is trusted", () => {
        expect(() => checkNotaryKey(OTHER_KEY, [NOTARY_KEY])).toThrow(NotaryKeyMismatchError)
        expect(() => checkNotaryKey(NOTARY_KEY, [])).toThrow(NotaryKeyMismatchError)
    })
})

describe("mainnet notary pins", () => {
    /**
     * The keys are filled after the notary key ceremony. Until then they must
     * match nothing, so a build released early fails closed on mainnet.
     */
    it("are placeholders that match nothing, or real compressed secp256k1 keys", () => {
        expect(
            isTlsnPlaceholder(TLSN_MAINNET_NOTARY_URL) ||
                new URL(TLSN_MAINNET_NOTARY_URL).protocol === "https:",
        ).toBe(true)
        expect(TLSN_MAINNET_NOTARY_KEYS.length).toBeGreaterThan(0)
        for (const key of TLSN_MAINNET_NOTARY_KEYS) {
            expect(key.alg).toBe("k256")
            if (isTlsnPlaceholder(key.hex)) {
                expect(notaryKeyMatches("02" + "ab".repeat(32), key.hex)).toBe(false)
            } else {
                expect(key.hex).toMatch(/^0[23][0-9a-f]{64}$/)
            }
        }
    })
})

describe("resolveNotary", () => {
    const host = (chainId: number, getInfo: unknown) => ({
        getNetworkInfo: async () =>
            ({ forks: { osDenomination: { activated: true } }, chainId }) as any,
        nodeCall: jest.fn(async () => getInfo),
    })
    const info = { notaryUrl: "https://notary.example", publicKey: NOTARY_KEY }

    it("trusts the key the node reports outside mainnet", async () => {
        await expect(resolveNotary(host(1, info))).resolves.toEqual({
            notaryUrl: "https://notary.example",
            trustedNotaryKeys: [NOTARY_KEY],
            maxPresentationBytes: TLSN_DEFAULT_MAX_PRESENTATION_BYTES,
            pinned: false,
        })
        await expect(
            resolveNotary(host(1, { ...info, maxPresentationBytes: 2048 })),
        ).resolves.toMatchObject({ maxPresentationBytes: 2048 })
    })

    it("never takes a mainnet key from the node", async () => {
        // An RPC reporting its own notary key must not become trusted on
        // mainnet: either the pins are used, or, while they are
        // placeholders, the call refuses.
        const pinned = !isTlsnPlaceholder(TLSN_MAINNET_NOTARY_URL)
        const result = resolveNotary(host(TLSN_MAINNET_CHAIN_ID, info))
        if (pinned) {
            const resolved = await result
            expect(resolved.pinned).toBe(true)
            expect(resolved.notaryUrl).toBe(TLSN_MAINNET_NOTARY_URL)
            expect(resolved.trustedNotaryKeys).not.toContain(NOTARY_KEY)
        } else {
            await expect(result).rejects.toThrow("no mainnet TLSNotary notary pinned")
        }
    })

    it("refuses a node without a notary", async () => {
        await expect(resolveNotary(host(1, { success: false }))).rejects.toThrow(
            "does not support TLSNotary",
        )
    })
})
