import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { bytesToHex, signatureFromHex, signatureToHex } from "../utils/hex"
import type {
    ChannelMessage,
    ChannelTranscript,
    UnsignedChannelMessage,
    UnsignedChannelTranscript,
} from "./types"

/**
 * Domain separation prefixes — verbatim from the brief (§2 WI-2, WI-3) and
 * the spec references at §B.7. A signature lifted from one domain (e.g.
 * channelmsg) fails verification in any other (e.g. transcript / binding).
 */
export const CHANNEL_MESSAGE_DOMAIN_PREFIX = "dacs-channelmsg:v1:"
export const TRANSCRIPT_DOMAIN_PREFIX = "dacs-transcript:v1:"

/**
 * Hex digest of `JCS(envelope_without_signature)`. Exposed as a primitive
 * so auditors can re-derive the hash independently from the wire envelope.
 */
export function envelopeHashHex(unsigned: UnsignedChannelMessage): string {
    const canonical = canonicalJSONStringify(unsigned)
    return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}

/**
 * Bytes the channel-message signature covers:
 *   `dacs-channelmsg:v1:` || envelope_hash_hex
 */
export function channelMessageSigningBytes(
    unsigned: UnsignedChannelMessage,
): Uint8Array {
    return new TextEncoder().encode(
        CHANNEL_MESSAGE_DOMAIN_PREFIX + envelopeHashHex(unsigned),
    )
}

export function stripChannelMessageSignature(
    msg: ChannelMessage,
): UnsignedChannelMessage {
    const { signature: _signature, ...rest } = msg
    return rest
}

export function transcriptHashHex(
    unsigned: UnsignedChannelTranscript,
): string {
    const canonical = canonicalJSONStringify(unsigned)
    return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}

export function transcriptSigningBytes(
    unsigned: UnsignedChannelTranscript,
): Uint8Array {
    return new TextEncoder().encode(
        TRANSCRIPT_DOMAIN_PREFIX + transcriptHashHex(unsigned),
    )
}

export function stripTranscriptSignatures(
    t: ChannelTranscript,
): UnsignedChannelTranscript {
    const { signatures: _signatures, ...rest } = t
    return rest
}

// Re-exported from the shared utility so existing imports of
// `signatureFromHex` / `signatureToHex` from this module keep working.
export { signatureFromHex, signatureToHex }
