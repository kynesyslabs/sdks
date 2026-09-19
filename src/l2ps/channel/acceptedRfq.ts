import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import type { ChannelMessage } from "./types"
import { envelopeHashHex, stripChannelMessageSignature } from "./canonical"

/** The accepted outcome must be backed by this exact channel's signed exchange. */
export function matchesAcceptedRfq(
    outcome: {
        channelId?: string
        acceptedProposalHash?: string
        acceptMessageHash?: string
        acceptedSequence?: number
        agreedTerms?: unknown
    },
    channelId: string,
    messages: ReadonlyArray<ChannelMessage>,
): boolean {
    if (!outcome.channelId || outcome.channelId !== channelId ||
        !outcome.acceptedProposalHash || !outcome.acceptMessageHash)
        return false
    const sequence = outcome.acceptedSequence
    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1)
        return false

    const proposal = messages.find(
        m => m.channelId === outcome.channelId &&
            m.sequence === sequence &&
            (m.type === "offer" || m.type === "counter"),
    )
    const accept = messages.find(
        m => m.channelId === outcome.channelId &&
            m.sequence > sequence &&
            m.type === "accept" &&
            (m.body as { acceptedSequence?: number } | undefined)?.acceptedSequence === sequence,
    )
    if (!proposal || !accept || !proposal.body || typeof proposal.body !== "object" ||
        !Object.prototype.hasOwnProperty.call(proposal.body, "terms"))
        return false

    try {
        const terms = (proposal.body as { terms: unknown }).terms
        return envelopeHashHex(stripChannelMessageSignature(proposal)) ===
            outcome.acceptedProposalHash &&
            envelopeHashHex(stripChannelMessageSignature(accept)) ===
            outcome.acceptMessageHash &&
            canonicalJSONStringify(terms) === canonicalJSONStringify(outcome.agreedTerms)
    } catch {
        return false
    }
}
