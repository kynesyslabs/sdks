import {
    isDemosClaim,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type {
    ChannelMessage,
    ChannelMessageSignature,
    UnsignedChannelMessage,
} from "./types"
import {
    channelMessageSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripChannelMessageSignature,
} from "./canonical"

/**
 * Sign a `ChannelMessage` envelope with the sender's primary-claim key.
 *
 * The signature covers `dacs-channelmsg:v1:` || sha256(JCS(envelope w/o
 * signature)). Transport-level wrappers MUST NOT alter the bytes returned
 * here. Throws if `unsigned.sender` is not a demos: ClaimReference or
 * does not match the connected wallet — preserves the
 * in-channel-signer == on-chain-party invariant.
 */
export async function signChannelMessage(
    unsigned: UnsignedChannelMessage,
    demos: Demos,
): Promise<ChannelMessage> {
    if (!isDemosClaim(unsigned.sender))
        throw new Error(
            `signChannelMessage: sender must be a demos: ClaimReference, got "${unsigned.sender}"`,
        )
    if (!Number.isInteger(unsigned.sequence) || unsigned.sequence < 1)
        throw new Error(
            `signChannelMessage: sequence must be a positive integer (got ${unsigned.sequence})`,
        )
    if (!unsigned.channelId)
        throw new Error("signChannelMessage: channelId required")

    const payload = channelMessageSigningBytes(unsigned)
    const sigBytes = await signWithPrimaryClaim(unsigned.sender, payload, demos)
    const signature: ChannelMessageSignature = {
        sigVersion: "1",
        signature: signatureToHex(sigBytes),
    }
    return { ...unsigned, signature }
}

/**
 * Pure signature check: verifies `msg.signature` covers JCS(msg without
 * signature) with the `dacs-channelmsg:v1:` prefix under the key encoded
 * in `msg.sender`. Membership (`sender ∈ members`) and sequence enforcement
 * are handled by `ChannelSession` — this function does crypto only.
 */
export function verifyChannelMessage(msg: ChannelMessage): boolean {
    if (msg?.signature?.sigVersion !== "1") return false
    if (!isDemosClaim(msg.sender)) return false
    if (!Number.isInteger(msg.sequence) || msg.sequence < 1) return false
    if (!msg.channelId) return false

    try {
        const payload = channelMessageSigningBytes(
            stripChannelMessageSignature(msg),
        )
        const sig = signatureFromHex(msg.signature.signature)
        return verifyPrimaryClaimSignature(msg.sender, payload, sig)
    } catch {
        return false
    }
}

/**
 * Pure membership check. Kept separate so `verifyChannelMessage` can be
 * called in contexts where the member set hasn't been resolved yet (e.g.
 * audit replay from a transcript).
 */
export function isSenderInMembers(
    msg: ChannelMessage,
    members: Iterable<ClaimReference>,
): boolean {
    for (const m of members) if (m === msg.sender) return true
    return false
}
