import {
    entropyToMnemonic,
    mnemonicToSeedSync,
    validateMnemonic,
} from "@scure/bip39"
import { wordlist as japaneseWordlist } from "@scure/bip39/wordlists/japanese.js"
import { Demos } from "@/websdk"
import { legacySeed } from "./utils/legacySeed"

// Standard BIP-39 test vector.
const PHRASE =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const PHRASE_ADDRESS =
    "0x263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8"

// Phrases bip39 accepts after NFKD, but that derivation hashed as written.
const IDEOGRAPHIC_SPACES = PHRASE.split(" ").join("　")
const FULLWIDTH_FIRST_WORD = PHRASE.replace(
    "abandon",
    "ａｂａｎｄｏｎ",
)

// 128 chars, accepted word count, bad checksum.
const INVALID_128 = [
    ...Array(10).fill("abandon"),
    ...Array(7).fill("about"),
    "absent",
].join(" ")

// Addresses that `connectWallet(<phrase>)` returned for these phrases before
// this check (SDK 4.0.21, base 6071ad93bd).
const CAPITALISED_LEGACY_ADDRESS =
    "0x506aec3bb751439d26451eb442c6177ab479be667455e735bf596605d39ebef2"
const IDEOGRAPHIC_SPACES_LEGACY_ADDRESS =
    "0xe6b78135a9f6b88f0c6a6024d1c55a7471f10d23e4567dd483a445931a661c5a"
const FULLWIDTH_FIRST_WORD_LEGACY_ADDRESS =
    "0x4c2440b6127be3f0b2c955cf41e4b78deef95f5ecc866a76a06395cace61319b"
const INVALID_128_LEGACY_ADDRESS =
    "0xe309954389d21e72f28ce7fde1cba85ecfd8cce0775f9ed75d862b3e2be81b1c"

// The repo's long-standing spec fixture. Its checksum is invalid, so the
// specs that use it open its wallet with legacySeed(phrase).
const FIXTURE_PHRASE =
    "polar scale globe beauty stock employ rail exercise goat into sample embark"
const FIXTURE_LEGACY_ADDRESS =
    "0xf79f5f69fc01600f8e7e796b05549b088bf7d5dac768d6b0404842a8da283aeb"

const INVALID = /invalid recovery phrase/i
const NON_CANONICAL = /invalid recovery phrase: .*non-canonical characters/i

async function addressOf(secret: string | Uint8Array) {
    return await new Demos().connectWallet(secret, { algorithm: "ed25519" })
}

describe("connectWallet recovery phrase validation (#175)", () => {
    it("keeps the known address for the standard test phrase", async () => {
        expect(await addressOf(PHRASE)).toBe(PHRASE_ADDRESS)
    })

    it("refuses a phrase whose first word is capitalised", async () => {
        const capitalised = PHRASE.replace("abandon", "Abandon")

        await expect(addressOf(capitalised)).rejects.toThrow(INVALID)
    })

    it("refuses a phrase with a misspelt word", async () => {
        const typo = PHRASE.replace(/about$/, "abount")

        await expect(addressOf(typo)).rejects.toThrow(INVALID)
    })

    it("refuses a phrase with a bad checksum", async () => {
        const badChecksum = PHRASE.replace(/about$/, "abandon")

        await expect(addressOf(badChecksum)).rejects.toThrow(INVALID)
    })

    it("refuses a phrase with a missing word", async () => {
        const short = PHRASE.split(" ").slice(1).join(" ")

        await expect(addressOf(short)).rejects.toThrow(INVALID)
    })

    it("refuses a phrase with doubled inner spaces", async () => {
        // Derivation hashes the phrase as written, so it is not normalised.
        const doubled = PHRASE.replace("abandon abandon", "abandon  abandon")

        await expect(addressOf(doubled)).rejects.toThrow(INVALID)
    })

    it("refuses a phrase with ideographic spaces (U+3000) between words", async () => {
        await expect(addressOf(IDEOGRAPHIC_SPACES)).rejects.toThrow(
            NON_CANONICAL,
        )
    })

    it("refuses a phrase with a full-width first word", async () => {
        await expect(addressOf(FULLWIDTH_FIRST_WORD)).rejects.toThrow(
            NON_CANONICAL,
        )
    })

    it("refuses an arbitrary non-mnemonic string", async () => {
        await expect(addressOf("not a valid mnemonic")).rejects.toThrow(INVALID)
    })

    it("points a refused phrase to the upgrade note", async () => {
        // Retyping it as the message asks opens a different wallet, so a user
        // who funded the old one must be told how to reach it.
        // The CHANGELOG is not in the published package, so the message links
        // to it, and names only the versions whose derivation the note covers.
        const hint =
            /If this exact phrase opened a wallet with SDK 2\.3\.16 to 4\.0\.21, see the upgrade note in https:\/\/github\.com\/kynesyslabs\/sdks\/blob\/main\/CHANGELOG\.md$/

        await expect(
            addressOf(PHRASE.replace("abandon", "Abandon")),
        ).rejects.toThrow(hint)
        await expect(addressOf(IDEOGRAPHIC_SPACES)).rejects.toThrow(hint)
    })

    it("says the phrase is not a valid English mnemonic", async () => {
        // Only the English wordlist is checked; a valid phrase in another
        // wordlist (e.g. Italian) is refused too.
        await expect(
            addressOf(PHRASE.replace("about", "abount")),
        ).rejects.toThrow(
            /^Invalid recovery phrase: not a valid English BIP-39 mnemonic\./,
        )

        // A valid Japanese phrase has U+3000 between words, so it hits the
        // non-canonical check first; no retyping can make it pass.
        const japanese = entropyToMnemonic(new Uint8Array(16), japaneseWordlist)
        expect(validateMnemonic(japanese, japaneseWordlist)).toBe(true)
        await expect(addressOf(japanese)).rejects.toThrow(NON_CANONICAL)
        await expect(addressOf(japanese)).rejects.toThrow(
            /Only English BIP-39 phrases are accepted\./,
        )
    })

    it("does not replace the keypair of a connected instance on refusal", async () => {
        const demos = new Demos()
        const before = await demos.connectWallet(PHRASE, {
            algorithm: "ed25519",
        })

        await expect(
            demos.connectWallet(PHRASE.replace("abandon", "Abandon"), {
                algorithm: "ed25519",
            }),
        ).rejects.toThrow(INVALID)
        expect(demos.getAddress()).toBe(before)
    })

    it("keeps the signing algorithm and dual signing of a connected instance on refusal", async () => {
        const demos = new Demos()
        const before = await demos.connectWallet(PHRASE, {
            algorithm: "falcon",
            dual_sign: true,
        })

        // No options: on refusal the defaults (ed25519, no dual signing) must
        // not be applied, or the instance would sign as another identity.
        await expect(
            demos.connectWallet(PHRASE.replace("abandon", "Abandon")),
        ).rejects.toThrow(INVALID)
        expect(demos.algorithm).toBe("falcon")
        expect(demos.dual_sign).toBe(true)
        expect(demos.getAddress()).toBe(before)
        expect(demos.getAddress()).not.toBe(PHRASE_ADDRESS)
    })

    it("still trims surrounding whitespace, as derivation always did", async () => {
        expect(await addressOf(`  ${PHRASE}\n`)).toBe(PHRASE_ADDRESS)
    })

    it("accepts generated mnemonics of both strengths", async () => {
        const demos = new Demos()

        await expect(
            demos.connectWallet(demos.newMnemonic(128)),
        ).resolves.toBeTruthy()
        await expect(
            demos.connectWallet(demos.newMnemonic(256)),
        ).resolves.toBeTruthy()
    })

    it("leaves the 128-hex string path as it was", async () => {
        // On the unfixed base this string already fails inside bip39
        // (`mnemonicToSeedSync`); the check must not turn it into a new error.
        await expect(addressOf("ab".repeat(64))).rejects.toThrow(
            /^Invalid mnemonic$/,
        )
    })

    it("refuses a 128-char string that is neither hex nor a valid phrase", async () => {
        await expect(addressOf("z".repeat(128))).rejects.toThrow(INVALID)
    })

    it("leaves the byte-array seed paths unchanged", async () => {
        const short = new Uint8Array(32).fill(7)
        const raw128 = new Uint8Array(128).fill(9)

        expect(await addressOf(short)).toBe(await addressOf(short))
        expect(await addressOf(raw128)).toBe(await addressOf(raw128))
        expect(await addressOf(short)).not.toBe(await addressOf(raw128))
    })

    it("keeps the address a refused phrase used to open reachable by byte seed", async () => {
        // For any length but 128 the old derivation hashed the phrase itself.
        // Passing the 128 bytes of legacySeed(phrase) reproduces it.
        const capitalised = PHRASE.replace("abandon", "Abandon")
        const seed = legacySeed(capitalised)

        expect(capitalised.length).toBe(93)
        expect(seed.length).toBe(128)
        expect(await addressOf(seed)).toBe(CAPITALISED_LEGACY_ADDRESS)
    })

    it("keeps the address a non-canonical phrase used to open reachable by byte seed", async () => {
        // bip39 accepted these, and the old derivation hashed them as written.
        expect(await addressOf(legacySeed(IDEOGRAPHIC_SPACES))).toBe(
            IDEOGRAPHIC_SPACES_LEGACY_ADDRESS,
        )
        expect(await addressOf(legacySeed(FULLWIDTH_FIRST_WORD))).toBe(
            FULLWIDTH_FIRST_WORD_LEGACY_ADDRESS,
        )
    })

    it("keeps the address a refused 128-char phrase used to open reachable by byte seed", async () => {
        // At exactly 128 chars, an invalid phrase was hashed via its bip39
        // seed, not as written.
        expect(INVALID_128.length).toBe(128)
        await expect(addressOf(INVALID_128)).rejects.toThrow(INVALID)

        expect(
            await addressOf(legacySeed(mnemonicToSeedSync(INVALID_128))),
        ).toBe(INVALID_128_LEGACY_ADDRESS)
        expect(await addressOf(legacySeed(INVALID_128))).not.toBe(
            INVALID_128_LEGACY_ADDRESS,
        )
    })

    it("keeps the spec fixture phrase's wallet reachable by byte seed", async () => {
        await expect(addressOf(FIXTURE_PHRASE)).rejects.toThrow(INVALID)
        expect(await addressOf(legacySeed(FIXTURE_PHRASE))).toBe(
            FIXTURE_LEGACY_ADDRESS,
        )
    })
})
