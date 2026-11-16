import * as crypto from "crypto"
import { Cryptography } from "@/encryption/Cryptography"
import { Hashing } from "@/encryption/Hashing"
import L2PS from "@/l2ps/l2ps"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import forge from "node-forge"

// Matches node stabilisation src/libs/crypto/hashing.ts since dcbee323.
const nodeSha256 = (message: string) =>
    crypto.createHash("sha256").update(message).digest("hex")

describe("Hashing.sha256", () => {
    test("ASCII input hashes the same as before", () => {
        expect(Hashing.sha256("hello")).toBe(
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        )
        const json = '{"amount":1,"memo":"plain ascii"}'
        expect(Hashing.sha256(json)).toBe(
            "009ce820add7dd90cd7ddae37b46c5ea1f83dc032d142152b4afc3b0658034f9",
        )
        expect(Hashing.sha256(json)).toBe(Hashing.sha256(json, "raw"))
    })

    test("non-ASCII input matches the node's UTF-8 hash", () => {
        const vectors: [string, string][] = [
            [
                "a — b",
                "935e0e548aeadc34712c2660c871268c07644b381977b0d9b00878abeb9c3b23",
            ],
            [
                "launch \u{1F680}",
                "5840f0fa319a05e913e39f8a6e11676a3c3abaffc7c3d5ae026174292d8b7048",
            ],
            [
                '{"memo":"price — 10 \u{1F680}"}',
                "4eb1cc5bb3e25d0d384eb966d03ef3362de0ce6311fbfe1c9d9a9b652c999f37",
            ],
        ]
        for (const [input, expected] of vectors) {
            expect(Hashing.sha256(input)).toBe(nodeSha256(input))
            expect(Hashing.sha256(input)).toBe(expected)
        }
    })

    test('only "raw" opts out of UTF-8 hashing', () => {
        const inputs = ["josé", "café"]
        // JavaScript's map passes an index as the second argument.
        const jsCallback = Hashing.sha256 as unknown as (
            value: string,
            index: number,
        ) => string
        expect(inputs.map(jsCallback)).toEqual(inputs.map(nodeSha256))
        expect(Hashing.sha256("café", "utf-8" as "utf8")).toBe(
            nodeSha256("café"),
        )
    })

    test("unpaired surrogates match the node's replacement characters", () => {
        for (const input of [
            "a\ud800b",
            "a\udc00b",
            "\ud800\ud800\udc00\udc00",
            "\ud83d\ude80",
        ]) {
            expect(Hashing.sha256(input)).toBe(nodeSha256(input))
        }
    })

    test("unpaired surrogates match the node without toWellFormed", () => {
        const original = Object.getOwnPropertyDescriptor(
            String.prototype,
            "toWellFormed",
        )
        try {
            Object.defineProperty(String.prototype, "toWellFormed", {
                configurable: true,
                value: undefined,
            })
            const input = "\ud800\ud83d\ude80\udc00"
            expect(Hashing.sha256(input)).toBe(nodeSha256(input))
        } finally {
            if (original) {
                Object.defineProperty(String.prototype, "toWellFormed", original)
            } else {
                Reflect.deleteProperty(String.prototype, "toWellFormed")
            }
        }
    })

    test('"raw" hashes one byte per char code', () => {
        const key = String.fromCharCode(
            ...Array.from({ length: 32 }, (_, i) => 0x80 + i * 3),
        )
        const expected =
            "aea99b6c1961bf5fb3d304e958317e27224afe4e20e364ffecb633ef25c55232"
        expect(Hashing.sha256(key, "raw")).toBe(expected)
        expect(
            crypto.createHash("sha256")
                .update(Buffer.from(key, "latin1"))
                .digest("hex"),
        ).toBe(expected)
    })

    test('"raw" passes char codes above 0xFF to forge unchanged', () => {
        const input = "a — b"
        const forgeHash = forge.sha256.create()
        forgeHash.update(input, "raw")
        expect(Hashing.sha256(input, "raw")).toBe(forgeHash.digest().toHex())
        expect(Hashing.sha256(input, "raw")).not.toBe(
            crypto.createHash("sha256").update(Buffer.from(input, "latin1")).digest("hex"),
        )
    })

    test("rejects non-string input with a clear error", () => {
        for (const input of [Buffer.from("abc"), 42]) {
            expect(() => Hashing.sha256(input as unknown as string)).toThrow(
                new TypeError("Hashing.sha256 expects a string"),
            )
        }
    })
})

describe("GCR identity edit proof hashes", () => {
    const proofHash = async (method: string, proof: unknown) => {
        const tx = {
            hash: "test-tx",
            content: {
                type: "identity",
                from_ed25519_address: "sender",
                timestamp: 1,
                data: ["identity", {
                    method,
                    context: "twitter",
                    payload: {
                        context: "twitter",
                        username: "jose",
                        userId: "1",
                        proof,
                    },
                }],
            },
        }
        const edits = await GCRGeneration.generate(tx as any)
        return (edits[0] as any).data.data.proofHash
    }

    test("web2 proof uses the 4.0.19 raw hash for non-ASCII text", async () => {
        expect(await proofHash("web2_identity_assign", "https://x.com/josé/status/1")).toBe(
            "e81566e36f2732d6d34913f0bce8f0afcd9a040aeb07c262390776ad9cd22b92",
        )
    })

    test("TLSN proof uses the 4.0.19 raw hash for non-ASCII JSON", async () => {
        expect(await proofHash("tlsn_identity_assign", { message: "café" })).toBe(
            "bc374af2491471579e029761cfae12673611404bebe659b22ab375f7a37f9ada",
        )
    })

    test("ASCII proof keeps the same hash", async () => {
        expect(await proofHash("web2_identity_assign", "https://x.com/jose/status/1")).toBe(
            "9d77f370ce9794b8922d707c94513003ee128d85a0f184541174d83451d62cf9",
        )
    })
})

describe("binary callers keep their output", () => {
    test("Cryptography.newFromSeed with a Buffer seed", () => {
        const seed = Buffer.from(
            Array.from({ length: 64 }, (_, i) => (i * 37 + 200) & 0xff),
        )
        const keypair = Cryptography.newFromSeed(seed)
        expect(Buffer.from(keypair.publicKey).toString("hex")).toBe(
            "bd035834e2219c0aa0cf499575ed349e318992265068c45f4fde19bf3f1cca98",
        )
    })

    test("L2PS id and key fingerprint", async () => {
        const key = String.fromCharCode(
            ...Array.from({ length: 32 }, (_, i) => 0x80 + i * 3),
        )
        const l2ps = await L2PS.create(key, "\x00".repeat(12))
        const expected =
            "aea99b6c1961bf5fb3d304e958317e27224afe4e20e364ffecb633ef25c55232"
        expect(l2ps.getId()).toBe(expected)
        expect(await l2ps.getKeyFingerprint()).toBe(expected.substring(0, 16))
    })
})
