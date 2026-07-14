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

export {
    L2PSChannelTransport,
    type L2PSChannelTransportOpts,
    type ChannelSessionLike,
    type L2PSMessagingPeerLike,
    type SerializedEncryptedMessage,
    type IncomingMessagePayload,
} from "./transport"

export {
    RfqSession,
    type RfqState,
    type RfqOutcome,
    type RfqSessionOpts,
    type RfqProposalBody,
    type RfqAcceptBody,
    type RfqEndBody,
    type StandingProposal,
} from "./negotiate"

export {
    finalizeRfq,
    type FinalizeRfqOpts,
    type RfqFinalizeResult,
    type RfqLike,
    type ChannelSessionView,
} from "./finalize"

export {
    SealedEnvelopeSession,
    commitmentHex,
    SEALED_ENVELOPE_DOMAIN_PREFIX,
    type SealedEnvelopeState,
    type SealedEnvelopeOutcome,
    type SealedEnvelopeSessionOpts,
    type SealedCommitBody,
    type SealedRevealBody,
    type SealedAbortBody,
    type SealedCommitment,
    type RevealedBid,
} from "./sealedEnvelope"

export {
    finalizeSealedEnvelope,
    type FinalizeSealedEnvelopeOpts,
    type SealedEnvelopeFinalizeResult,
    type SealedEnvelopeLike,
} from "./finalizeSealed"
