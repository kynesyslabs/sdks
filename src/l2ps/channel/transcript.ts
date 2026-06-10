import {
    isDemosClaim,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import type {
    ChannelMessage,
    ChannelTranscript,
    TranscriptSignature,
    UnsignedChannelTranscript,
} from "./types"
import {
    signatureFromHex,
    signatureToHex,
    stripTranscriptSignatures,
    transcriptSigningBytes,
} from "./canonical"
import { isSenderInMembers, verifyChannelMessage } from "./envelope"

/**
 * Build the unsigned transcript shell. Messages must already be in
 * sequence order — typically `session.messages()`.
 */
export function buildUnsignedTranscript(opts: {
    channelId: string
    members: ClaimReference[]
    messages: ReadonlyArray<ChannelMessage>
    generatedAt?: number
}): UnsignedChannelTranscript {
    return {
        transcriptVersion: "1",
        channelId: opts.channelId,
        members: [...opts.members],
        messages: [...opts.messages],
        generatedAt: opts.generatedAt ?? Date.now(),
    }
}

/**
 * Produce one party's `TranscriptSignature` over the unsigned transcript.
 * Domain-separated under `dacs-transcript:v1:` — cannot be confused with
 * a channel-message or binding signature.
 */
export async function signTranscript(
    unsigned: UnsignedChannelTranscript,
    signer: ClaimReference,
    demos: Demos,
): Promise<TranscriptSignature> {
    if (!isDemosClaim(signer))
        throw new Error(
            `signTranscript: signer must be a demos: ClaimReference, got "${signer}"`,
        )
    const payload = transcriptSigningBytes(unsigned)
    const sigBytes = await signWithPrimaryClaim(signer, payload, demos)
    return {
        sigVersion: "1",
        signer,
        signature: signatureToHex(sigBytes),
    }
}

/**
 * Convenience: assemble the full transcript with one or more party
 * signatures. Pass signers in the order their signatures should appear.
 */
export async function exportTranscript(opts: {
    channelId: string
    members: ClaimReference[]
    messages: ReadonlyArray<ChannelMessage>
    signers: Array<{ claim: ClaimReference; demos: Demos }>
    generatedAt?: number
}): Promise<ChannelTranscript> {
    const unsigned = buildUnsignedTranscript(opts)
    const signatures: TranscriptSignature[] = []
    for (const s of opts.signers) {
        signatures.push(await signTranscript(unsigned, s.claim, s.demos))
    }
    return { ...unsigned, signatures }
}

export interface TranscriptVerificationResult {
    ok: boolean
    errors: string[]
}

/**
 * Verify every claim about a transcript a non-member can check given only
 * the public keys: (a) each `TranscriptSignature` is valid, (b) each
 * `ChannelMessage` carries a valid signature, (c) every message's sender
 * is in `members`, (d) sequences are strictly monotonic per channel,
 * (e) every message's `channelId` matches the transcript.
 *
 * Returns a list of errors rather than throwing so auditors can collect
 * every failure in one pass.
 */
export function verifyTranscript(
    t: ChannelTranscript,
): TranscriptVerificationResult {
    const errors: string[] = []
    if (!t || t.transcriptVersion !== "1") {
        errors.push("transcriptVersion is not 1")
        return { ok: false, errors }
    }
    if (!t.channelId) errors.push("missing channelId")
    if (!t.members?.length) errors.push("missing members")

    let unsigned: UnsignedChannelTranscript
    try {
        unsigned = stripTranscriptSignatures(t)
    } catch {
        errors.push("could not strip signatures")
        return { ok: false, errors }
    }

    if (!t.signatures?.length) {
        errors.push("no transcript signatures")
    } else {
        const payload = transcriptSigningBytes(unsigned)
        for (const s of t.signatures) {
            if (s.sigVersion !== "1") {
                errors.push(`transcript signature: unknown sigVersion ${s.sigVersion}`)
                continue
            }
            if (!t.members.includes(s.signer)) {
                errors.push(
                    `transcript signature signer "${s.signer}" not in members`,
                )
                continue
            }
            try {
                const ok = verifyPrimaryClaimSignature(
                    s.signer,
                    payload,
                    signatureFromHex(s.signature),
                )
                if (!ok)
                    errors.push(
                        `transcript signature by "${s.signer}" failed verification`,
                    )
            } catch (e) {
                errors.push(
                    `transcript signature by "${s.signer}" malformed: ${(e as Error).message}`,
                )
            }
        }
    }

    let highestSeen = 0
    for (const msg of t.messages ?? []) {
        if (msg.channelId !== t.channelId) {
            errors.push(
                `message seq=${msg.sequence}: channelId mismatch (${msg.channelId} vs ${t.channelId})`,
            )
        }
        if (!isSenderInMembers(msg, t.members)) {
            errors.push(
                `message seq=${msg.sequence}: sender "${msg.sender}" not in members`,
            )
        }
        if (!Number.isInteger(msg.sequence) || msg.sequence < 1) {
            errors.push(`message: invalid sequence ${msg.sequence}`)
        } else if (msg.sequence <= highestSeen) {
            errors.push(
                `message seq=${msg.sequence}: non-monotonic (highest seen ${highestSeen})`,
            )
        } else {
            highestSeen = msg.sequence
        }
        if (!verifyChannelMessage(msg)) {
            errors.push(
                `message seq=${msg.sequence}: signature verification failed`,
            )
        }
    }

    return { ok: errors.length === 0, errors }
}
