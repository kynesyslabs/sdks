import { Hashing, uint8ArrayToHex } from "@/encryption"

/**
 * The 128-byte seed SDK 4.0.21 derived from `hashable` in
 * `connectWallet(<string>)`: sha3_512(hashable) as hex without `0x`, encoded
 * as UTF-8. For a phrase that is not 128 chars long, pass the phrase itself;
 * `connectWallet(legacySeed(phrase))` then opens the wallet that
 * `connectWallet(phrase)` opened before invalid phrases were refused (#175).
 *
 * @param hashable - The trimmed phrase, or for a 128-char invalid phrase its
 * bip39 seed (see the CHANGELOG upgrade note)
 * @returns The 128-byte master seed
 */
export function legacySeed(hashable: string | Uint8Array): Uint8Array {
    const digestHex = uint8ArrayToHex(Hashing.sha3_512(hashable)).slice(2)
    return new TextEncoder().encode(digestHex)
}
