import type { ClaimReference } from "@/identity/cci"
import type { L2PSEncryptedBytes } from "../l2ps"

/**
 * §8.7 disclosure policy values. Naming verbatim from the brief.
 */
export type TranscriptDisclosurePolicy =
    | "none"
    | "encrypted-anchored-recommended"
    | "encrypted-anchored-required"

/**
 * The reference the negotiate-* phase output carries (brief §2 WI-3 step 4):
 * a Storage Program address + a hex content hash that anyone can re-derive
 * by hashing the on-chain ciphertext.
 */
export interface AttestationRef {
    anchor: string
    contentHash: string
}

/**
 * Signature over the transcript-plaintext hash, written verbatim into the
 * Storage Program so members can re-verify after decryption.
 */
export interface AnchoredTranscriptSignature {
    sigVersion: "1"
    signer: ClaimReference
    signature: string
}

/**
 * Wire shape stored inside the Storage Program. Self-contained so a
 * verifier can run `verifyAnchorIntegrity` without prior context.
 */
export interface AnchoredTranscriptPayload {
    transcriptVersion: "1"
    channelId: string
    encrypted: L2PSEncryptedBytes
    /** Hex sha256 of the decoded ciphertext bytes — public tamper-evidence. */
    contentHash: string
    signature: AnchoredTranscriptSignature
}
