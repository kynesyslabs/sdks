/**
 * What a transaction signature commits to.
 *
 * Legacy signatures cover `TextEncoder(tx.hash)` — the bare 64-char hex digest
 * of the content. Those bytes say nothing about what was signed or where it is
 * valid, which costs twice: any signature over a 64-hex string is a
 * transaction signature (so a site can pass a transaction hash off as a login
 * nonce), and nothing binds a transaction to a network (so one accepted on a
 * testnet replays on mainnet for the same account).
 *
 * Once the node's `signatureDomain` fork is active the signed bytes are
 * `demos-tx:v1:<chainId>:<hash>`. The content, the hash and the wire format
 * are unchanged — only the preimage moves — so nothing downstream of a
 * transaction has to care.
 *
 * Keep this byte-for-byte identical to the node's
 * `src/libs/crypto/txSignaturePreimage.ts`: a mismatch makes every signature
 * this SDK produces invalid.
 */

/** Marks the bytes as a Demos transaction, versioned for future changes. */
export const TX_SIGNATURE_DOMAIN = "demos-tx:v1:"

/**
 * The bytes a transaction signature covers.
 *
 * @param hash - `tx.hash`, the hex digest of the canonical content.
 * @param chainId - The network's id, as reported by `getNetworkInfo`.
 *   Ignored while the fork is inactive.
 * @param forkActive - Whether the target node has activated `signatureDomain`.
 *   False reproduces the legacy bytes exactly.
 */
export function txSignaturePreimage(
    hash: string,
    chainId: number,
    forkActive: boolean,
): Uint8Array {
    if (!forkActive) {
        return new TextEncoder().encode(hash)
    }
    return new TextEncoder().encode(`${TX_SIGNATURE_DOMAIN}${chainId}:${hash}`)
}

const TX_PREIMAGE_FORMS = [
    /^[0-9a-fA-F]{64}$/,
    new RegExp(`^${TX_SIGNATURE_DOMAIN}\\d+:[0-9a-fA-F]{64}$`),
]

/**
 * Whether these bytes are what a transaction signature covers, before or
 * after the signatureDomain fork. A signature over them is a valid
 * transaction signature, so a message signer must not produce one for a
 * message it did not build itself.
 */
export function isTransactionSignaturePreimage(bytes: Uint8Array): boolean {
    let text: string
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        return false
    }
    return TX_PREIMAGE_FORMS.some(form => form.test(text))
}
