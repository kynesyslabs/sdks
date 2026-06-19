import type { ClaimReference } from "@/identity/cci"

/**
 * Allowed message types — verbatim from DACS-3 §8.3.3. Closed union by
 * design: the substrate enforces the conformance set; application bodies
 * are carried in `body: unknown`.
 */
export type ChannelMessageType =
    | "offer"
    | "counter"
    | "accept"
    | "reject"
    | "sealed-envelope-commit"
    | "sealed-envelope-reveal"
    | "abort"

/**
 * Brief doesn't define the wire shape of the signature container. Versioned
 * for forward compatibility (e.g. PQC swap-out) without breaking the
 * envelope layout. Signature is hex-encoded over `channelMessageSigningBytes`.
 */
export interface ChannelMessageSignature {
    sigVersion: "1"
    signature: string
}

/**
 * DACS-3 §8.3.3 envelope — verbatim. Transport-level fields may wrap this
 * but MUST NOT change the bytes that the signature covers.
 */
export interface ChannelMessage {
    channelId: string
    sequence: number
    sender: ClaimReference
    sentAt: number
    type: ChannelMessageType
    body: unknown
    refs?: { repliesTo?: number }
    signature: ChannelMessageSignature
}

export type UnsignedChannelMessage = Omit<ChannelMessage, "signature">

/**
 * Per-signer transcript signature. Each member signs the full transcript
 * (without `signatures`) — see WI-3 reference in the brief.
 */
export interface TranscriptSignature {
    sigVersion: "1"
    signer: ClaimReference
    signature: string
}

/**
 * DACS-3 §8.7 — the ordered, member-signed record of a channel session.
 * Consumed by WI-3 for encrypted-anchor flows.
 */
export interface ChannelTranscript {
    transcriptVersion: "1"
    channelId: string
    members: ClaimReference[]
    messages: ChannelMessage[]
    generatedAt: number
    signatures: TranscriptSignature[]
}

export type UnsignedChannelTranscript = Omit<ChannelTranscript, "signatures">
