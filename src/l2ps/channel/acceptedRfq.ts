import {
    isDemosClaim,
    normalizeDemosAddress,
    parseClaimRef,
    type ClaimReference,
} from "@/identity/cci"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import { envelopeHashHex, stripChannelMessageSignature } from "./canonical"
import { verifyChannelMessage } from "./envelope"
import type { ChannelMessage } from "./types"

function canonicalClaim(ref: ClaimReference): ClaimReference {
    if (!isDemosClaim(ref)) return ref
    const { scheme, identifier } = parseClaimRef(ref)
    return `${scheme}:${normalizeDemosAddress(identifier)}` as ClaimReference
}

/** Canonical, order-independent channel membership; duplicate identities fail. */
export function canonicalRfqMembers(
    members: ReadonlyArray<ClaimReference>,
): ClaimReference[] {
    if (!members?.length) throw new Error("RFQ session members required")

    const canonical = members
        .map(canonicalClaim)
        .sort((left, right) => left.localeCompare(right))
    for (let i = 1; i < canonical.length; i++) {
        if (canonical[i] === canonical[i - 1])
            throw new Error(`duplicate RFQ session member "${canonical[i]}"`)
    }
    return canonical
}

/** True when two membership arrays name exactly the same identities. */
export function sameRfqMembers(
    left: ReadonlyArray<ClaimReference>,
    right: ReadonlyArray<ClaimReference>,
): boolean {
    try {
        const a = canonicalRfqMembers(left)
        const b = canonicalRfqMembers(right)
        return a.length === b.length && a.every((member, i) => member === b[i])
    } catch {
        return false
    }
}

/** Identity-aware membership check using the same canonical form as the binding. */
export function isRfqMember(
    members: ReadonlyArray<ClaimReference>,
    claim: ClaimReference,
): boolean {
    try {
        return canonicalRfqMembers(members).includes(canonicalClaim(claim))
    } catch {
        return false
    }
}

/**
 * The accepted outcome must be backed by this exact channel's signed exchange.
 *
 * RFQ acceptance is bilateral, so the proposal and acceptance senders must be
 * distinct and together equal the complete session membership. This rejects a
 * signed exchange spliced onto a different pair even when a channel ID is
 * reused. Two sessions with both the same channel ID and the same members are
 * intentionally indistinguishable here; CH-6's ChannelIdRegistry prevents that
 * operationally, while the message hashes still select the exact exchange.
 */
export function matchesAcceptedRfq(
    outcome: {
        channelId?: string
        acceptedProposalHash?: string
        acceptMessageHash?: string
        acceptedSequence?: number
        agreedTerms?: unknown
    },
    channelId: string,
    members: ReadonlyArray<ClaimReference>,
    messages: ReadonlyArray<ChannelMessage>,
): boolean {
    if (!outcome.channelId || outcome.channelId !== channelId ||
        !outcome.acceptedProposalHash || !outcome.acceptMessageHash)
        return false
    const sequence = outcome.acceptedSequence
    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1)
        return false

    try {
        const proposal = messages.find(
            m => m.channelId === outcome.channelId &&
                m.sequence === sequence &&
                (m.type === "offer" || m.type === "counter") &&
                envelopeHashHex(stripChannelMessageSignature(m)) ===
                    outcome.acceptedProposalHash,
        )
        const accept = messages.find(
            m => m.channelId === outcome.channelId &&
                m.sequence > sequence &&
                m.type === "accept" &&
                m.refs?.repliesTo === sequence &&
                (m.body as { acceptedSequence?: number } | undefined)?.acceptedSequence === sequence &&
                envelopeHashHex(stripChannelMessageSignature(m)) ===
                    outcome.acceptMessageHash,
        )
        if (!proposal || !accept ||
            sameRfqMembers([proposal.sender], [accept.sender]) ||
            !sameRfqMembers(members, [proposal.sender, accept.sender]) ||
            !proposal.body || typeof proposal.body !== "object" ||
            !Object.prototype.hasOwnProperty.call(proposal.body, "terms") ||
            !verifyChannelMessage(proposal) || !verifyChannelMessage(accept))
            return false

        const terms = (proposal.body as { terms: unknown }).terms
        if (canonicalJSONStringify(terms) !==
            canonicalJSONStringify(outcome.agreedTerms))
            return false

        return true
    } catch {
        return false
    }
}
