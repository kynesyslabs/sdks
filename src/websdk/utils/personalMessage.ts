/**
 * Domain separation for arbitrary message signing.
 *
 * A Demos transaction signature covers `TextEncoder(tx.hash)` — the 64-char
 * hex sha256 of the transaction content — and nothing else identifies it as a
 * transaction. `signMessage` used to sign raw message bytes, so signing the
 * text "<64 hex chars>" produced a byte-identical signature to signing a
 * transaction with that hash. A site that asks a wallet to sign a login
 * challenge picks that challenge: it can hand over the hash of a transaction
 * it built and keep the signature the user believed was a login.
 *
 * Prefixing the message removes the overlap: the preimage of a personal
 * message can never equal the preimage of a transaction hash, so neither
 * signature is usable in the other's place.
 *
 * The shape follows the convention Ethereum's EIP-191 established — a
 * non-printable lead byte, a human-readable domain, and the message length —
 * so a signature carries what it committed to rather than a bare digest.
 */

/** Lead-in for personal messages. `\x19` keeps it off the printable range. */
export const DEMOS_MESSAGE_PREFIX = "\x19Demos Signed Message:\n"

/**
 * The bytes a personal message signature commits to:
 * `\x19Demos Signed Message:\n<byte length><message>`.
 *
 * The length is the message's byte length, not its character count, so
 * multi-byte text cannot be re-cut into a different message of the same
 * rendering.
 */
export function personalMessagePreimage(
    message: string | Uint8Array,
): Uint8Array {
    const body =
        typeof message === "string"
            ? new TextEncoder().encode(message)
            : message
    const header = new TextEncoder().encode(
        `${DEMOS_MESSAGE_PREFIX}${body.length}`,
    )
    const preimage = new Uint8Array(header.length + body.length)
    preimage.set(header, 0)
    preimage.set(body, header.length)
    return preimage
}
