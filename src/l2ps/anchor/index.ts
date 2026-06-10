/**
 * DACS-3 §8.7 — encrypted transcript anchoring (SR-4 WI-3).
 *
 * Encrypts a `ChannelTranscript` to the subnet member set via the
 * existing L2PS AES-GCM key, anchors the ciphertext + public content hash
 * via SR-2 Storage Program, and signs the transcript-plaintext hash with
 * the caller's Demos key.
 */

export {
    anchorEncryptedTranscript,
    anchorProgramName,
    decryptAnchoredTranscript,
    verifyAnchorIntegrity,
    type AnchorEncryptedTranscriptOpts,
    type DecryptAnchoredTranscriptOpts,
    type VerifyAnchorIntegrityResult,
} from "./anchor"

export type {
    AnchoredTranscriptPayload,
    AnchoredTranscriptSignature,
    AttestationRef,
    TranscriptDisclosurePolicy,
} from "./types"
