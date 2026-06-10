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
        out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
    }
    return out
}

function toUint8Array(buf: ArrayLike<number>): Uint8Array {
    if (buf instanceof Uint8Array) return buf
    return Uint8Array.from(buf)
}
