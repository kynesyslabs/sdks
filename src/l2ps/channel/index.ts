/**
 * DACS-3 §8.3.3 / §8.7 — channel message envelope, session-level
 * sequence + channelId enforcement, transcript export (SR-4 WI-2).
 *
 * All signatures use the sender's primary-claim key (on Demos: the
 * connected Demos Ed25519 keypair) via WI-0's `signWithPrimaryClaim`;
 * never the RSA L2PS subnet key.
 */

export type {
    ChannelMessage,
    ChannelMessageSignature,
    ChannelMessageType,
    ChannelTranscript,
    TranscriptSignature,
    UnsignedChannelMessage,
    UnsignedChannelTranscript,
} from "./types"

export {
    CHANNEL_MESSAGE_DOMAIN_PREFIX,
    TRANSCRIPT_DOMAIN_PREFIX,
    channelMessageSigningBytes,
    envelopeHashHex,
    signatureFromHex,
    signatureToHex,
    stripChannelMessageSignature,
    stripTranscriptSignatures,
    transcriptHashHex,
    transcriptSigningBytes,
} from "./canonical"

export {
    isSenderInMembers,
    signChannelMessage,
    verifyChannelMessage,
} from "./envelope"

export {
    InMemoryChannelIdRegistry,
    type ChannelIdRegistry,
} from "./channelIdRegistry"

export { ChannelSession, type ChannelSessionOpts } from "./session"

export {
    buildUnsignedTranscript,
    exportTranscript,
    signTranscript,
    verifyTranscript,
    type TranscriptVerificationResult,
} from "./transcript"
