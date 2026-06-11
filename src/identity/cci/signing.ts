import { Cryptography } from "@/encryption/Cryptography"
import { Demos } from "@/websdk/demosclass"
import type { ClaimReference } from "./types"
import {
    demosAddressFromClaim,
    normalizeDemosAddress,
    parseClaimRef,
} from "./claim"

/**
 * Sign a payload with the key controlling a CCI primary claim.
 *
 * The brief invariant (DACS-3 §0 / §8.3.2): in-channel signatures MUST be
 * produced by the key that controls the sender's primary claim — the same
 * key that holds value on-chain. On Demos that is the Demos Ed25519 key,
 * NOT the RSA L2PS subnet key.
 *
 * Domain separation is the caller's responsibility — pass the full payload
 * including the `dacs-*:v1:` prefix. WI-0 stays scheme-agnostic.
 *
 * @param claim   - The signer's primary `demos:` ClaimReference. Refuses any
 *                  other scheme until a controlling-key resolver for them
 *                  is added.
 * @param payload - Pre-domain-separated bytes to cover. Caller composes
 *                  `dacs-*:v1: || canonical_hash`.
 * @param demos   - Connected `Demos` instance. Its Ed25519 address must
 *                  match `claim`'s identifier — otherwise we refuse to
 *                  produce a misattributable signature.
 * @returns       Raw 64-byte Ed25519 signature.
 * @throws {Error} If the scheme is not `demos`, the wallet is not
 *                 connected, or the connected address does not match the
 *                 claim's address.
 */
export async function signWithPrimaryClaim(
    claim: ClaimReference,
    payload: Uint8Array,
    demos: Demos,
): Promise<Uint8Array> {
    const { scheme } = parseClaimRef(claim)
    if (scheme !== "demos") {
        throw new Error(
            `signWithPrimaryClaim: unsupported scheme "${scheme}". Only "demos" is currently supported.`,
        )
    }
    if (!demos.walletConnected) {
        throw new Error("signWithPrimaryClaim: Demos wallet not connected")
    }

    const claimAddress = demosAddressFromClaim(claim)
    const connected = normalizeDemosAddress(await demos.getEd25519Address())
    if (claimAddress !== connected) {
        throw new Error(
            `signWithPrimaryClaim: claim "${claim}" does not match connected Demos wallet ${connected}`,
        )
    }

    const signed = await demos.crypto.sign("ed25519", payload)
    return toUint8Array(signed.signature as ArrayLike<number>)
}

/**
 * Verify an Ed25519 signature produced by `signWithPrimaryClaim`.
 *
 * Recovers the public key from the claim identifier and verifies forge-style.
 * Caller-supplied payload must match the bytes that were signed (including
 * any `dacs-*:v1:` domain prefix).
 *
 * @param claim     - The claimed signer's `demos:` ClaimReference.
 * @param payload   - Exact bytes that were signed (must roundtrip through
 *                    UTF-8). Caller composes `dacs-*:v1: || hash`.
 * @param signature - Raw 64-byte Ed25519 signature.
 * @returns        `true` iff the signature verifies under the public key
 *                 encoded in `claim`; `false` for cryptographic mismatch.
 * @throws {Error} If the scheme is not `demos` or the recovered public
 *                 key is not 32 bytes (malformed claim).
 */
export function verifyPrimaryClaimSignature(
    claim: ClaimReference,
    payload: Uint8Array,
    signature: Uint8Array,
): boolean {
    const { scheme } = parseClaimRef(claim)
    if (scheme !== "demos") {
        throw new Error(
            `verifyPrimaryClaimSignature: unsupported scheme "${scheme}"`,
        )
    }

    const publicKey = hexAddressToBytes(demosAddressFromClaim(claim))
    if (publicKey.length !== 32) {
        throw new Error(
            `verifyPrimaryClaimSignature: expected 32-byte Ed25519 public key, got ${publicKey.length}`,
        )
    }

    return Cryptography.verify(
        new TextDecoder().decode(payload),
        Buffer.from(signature),
        Buffer.from(publicKey),
    )
}

function hexAddressToBytes(address: string): Uint8Array {
    const hex = address.startsWith("0x") ? address.slice(2) : address
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
    }
    return out
}

function toUint8Array(buf: ArrayLike<number>): Uint8Array {
    if (buf instanceof Uint8Array) return buf
    return Uint8Array.from(buf)
}
