/**
 * The message a cross-chain (xm) identity proof signs, as nodes verify it
 * once the `xmProofBinding` fork is active:
 * `demos-xm:v1:<chain>:<targetAddress>:<demosSender>:<issuedAt>`.
 *
 * Before the fork the node accepts a signature over any text, so an old
 * signature by the wallet (a login message, another dapp's challenge) proves
 * the link, and nothing names the Demos account it was meant for. The bound
 * message names the chain, the wallet, the Demos account and the time.
 *
 * Mirrors the node's `xmBoundProofMessage` (src/libs/identity/xmProof.ts)
 * byte for byte: the chain and the sender are lower-cased, the address of a
 * case-insensitive chain (evm, aptos) is lower-cased, every other address is
 * kept as written because its alphabet is case-sensitive, and `issuedAt` is
 * epoch milliseconds.
 */
export const XM_PROOF_DOMAIN = "demos-xm:v1"

/** How old a bound proof may be when the node judges it. */
export const XM_PROOF_MAX_AGE_MS = 10 * 60 * 1000

const CASE_INSENSITIVE_CHAINS = new Set(["evm", "aptos"])

/** The address as the bound message spells it. */
export function canonicalXmAddress(chain: string, address: string): string {
    const trimmed = (address ?? "").trim()
    return CASE_INSENSITIVE_CHAINS.has(chain.toLowerCase())
        ? trimmed.toLowerCase()
        : trimmed
}

/**
 * The bound message for linking `targetAddress` on `chain` to the Demos
 * account `sender` (its ed25519 address, the transaction's
 * `from_ed25519_address`).
 *
 * @param issuedAt Epoch milliseconds; the node refuses a proof older than ten
 *   minutes or more than a minute in its future.
 */
export function xmBoundProofMessage(
    chain: string,
    targetAddress: string,
    sender: string,
    issuedAt: number,
): string {
    // The node reads the time back as 1 to 15 digits; anything else fails there.
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || String(issuedAt).length > 15) {
        throw new Error(`issuedAt must be epoch milliseconds, got ${issuedAt}`)
    }
    const c = chain.toLowerCase()
    return `${XM_PROOF_DOMAIN}:${c}:${canonicalXmAddress(c, targetAddress)}:${sender.toLowerCase()}:${issuedAt}`
}
