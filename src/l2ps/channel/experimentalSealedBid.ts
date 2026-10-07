/**
 * EXPERIMENTAL, NON-COMPLETE sealed-bid primitives. This is deliberately not a
 * DACS complete-auction state machine, receipt, or deadline authority.
 * See documentation/l2ps/experimental-sealed-bid.md before using it.
 */
import { sha256 } from "@noble/hashes/sha2"
import { randomBytes } from "@noble/hashes/utils"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
import type { ClaimReference } from "@/identity/cci"
import { bytesToHex } from "../utils/hex"
import { verifyChannelMessage } from "./envelope"
import type { ChannelMessage } from "./types"

/** Not the SAC-11 domain or a DACS Standard wire profile. */
export const EXPERIMENTAL_SEALED_BID_DOMAIN =
    "demos-sdk:experimental-basic-sealed-bid:v1:"
export const EXPERIMENTAL_SEALED_BID_SCHEME =
    "demos-sdk-experimental-basic-sealed-bid-v1"

export interface ExperimentalSealedBidContext {
    /** Identifies this auction, not merely its channel. */
    auctionId: string
    subjectKind: "job" | "listing"
    subjectId: string
    channelId: string
    /** Exact primary claim which must sign both channel messages. */
    bidder: ClaimReference
}

export interface ExperimentalSealedBidCommitBody {
    scheme: typeof EXPERIMENTAL_SEALED_BID_SCHEME
    auctionId: string
    subjectKind: "job" | "listing"
    subjectId: string
    commitment: string
}

export interface ExperimentalSealedBidOpeningBody {
    scheme: typeof EXPERIMENTAL_SEALED_BID_SCHEME
    auctionId: string
    subjectKind: "job" | "listing"
    subjectId: string
    bid: unknown
    /** Fresh 256-bit lowercase hex salt; keep private until opening. */
    salt: string
}

function assertContext(context: ExperimentalSealedBidContext): void {
    if (!context || typeof context !== "object")
        throw new Error("experimental sealed bid: context required")
    for (const field of ["auctionId", "subjectId", "channelId", "bidder"] as const) {
        if (typeof context[field] !== "string" || !context[field].trim())
            throw new Error(`experimental sealed bid: ${field} required`)
    }
    if (context.subjectKind !== "job" && context.subjectKind !== "listing")
        throw new Error("experimental sealed bid: subjectKind must be job or listing")
}

function canonicalBid(bid: unknown): string {
    // The shared canonicalizer rejects non-JSON values but permits non-finite
    // numbers, which JSON serializes as null. Reject that alias here.
    const inspect = (value: unknown): void => {
        if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0)))
            throw new Error("experimental sealed bid: non-finite or negative-zero number")
        if (Array.isArray(value)) value.forEach(inspect)
        else if (value && typeof value === "object") Object.values(value).forEach(inspect)
    }
    const canonical = canonicalJSONStringify(bid)
    inspect(bid)
    return canonical
}

function commitmentHex(
    context: ExperimentalSealedBidContext,
    canonical: string,
    salt: string,
): string {
    const payload = canonicalJSONStringify({
        auctionId: context.auctionId,
        subjectKind: context.subjectKind,
        subjectId: context.subjectId,
        channelId: context.channelId,
        bidder: context.bidder,
        bid: JSON.parse(canonical),
        salt,
    })
    return bytesToHex(
        sha256(new TextEncoder().encode(EXPERIMENTAL_SEALED_BID_DOMAIN + payload)),
    )
}

/**
 * Construct bodies for two separately signed ChannelSession messages. This
 * does not send, start a session, decide a phase, or discover other bidders.
 * Persist the opening securely until a separately verified reveal authority
 * permits sending it. Never include the opening in the commit message.
 */
export function createExperimentalSealedBid(
    context: ExperimentalSealedBidContext,
    bid: unknown,
): {
    commit: ExperimentalSealedBidCommitBody
    opening: ExperimentalSealedBidOpeningBody
} {
    assertContext(context)
    const canonical = canonicalBid(bid)
    const salt = bytesToHex(randomBytes(32))
    const details = {
        scheme: EXPERIMENTAL_SEALED_BID_SCHEME,
        auctionId: context.auctionId,
        subjectKind: context.subjectKind,
        subjectId: context.subjectId,
    } as const
    return {
        commit: {
            ...details,
            commitment: commitmentHex(context, canonical, salt),
        },
        opening: {
            ...details,
            bid: JSON.parse(canonical),
            salt,
        },
    }
}

/**
 * Verify one known commit/opening pair, including both channel signatures.
 * True means only that this bidder opened this commitment in this context;
 * it says nothing about deadlines, omitted channels, winner, or completeness.
 */
export function verifyExperimentalSealedBidOpening(
    context: ExperimentalSealedBidContext,
    commitMessage: ChannelMessage,
    openingMessage: ChannelMessage,
): boolean {
    try {
        assertContext(context)
        if (
            commitMessage.type !== "sealed-envelope-commit" ||
            openingMessage.type !== "sealed-envelope-reveal" ||
            commitMessage.channelId !== context.channelId ||
            openingMessage.channelId !== context.channelId ||
            commitMessage.sender !== context.bidder ||
            openingMessage.sender !== context.bidder ||
            commitMessage.sequence >= openingMessage.sequence ||
            !verifyChannelMessage(commitMessage) ||
            !verifyChannelMessage(openingMessage)
        ) return false

        const commit = commitMessage.body as ExperimentalSealedBidCommitBody
        const opening = openingMessage.body as ExperimentalSealedBidOpeningBody
        if (!commit || !opening || typeof commit !== "object" || typeof opening !== "object")
            return false
        for (const body of [commit, opening]) {
            if (
                body.scheme !== EXPERIMENTAL_SEALED_BID_SCHEME ||
                body.auctionId !== context.auctionId ||
                body.subjectKind !== context.subjectKind ||
                body.subjectId !== context.subjectId
            ) return false
        }
        if (
            typeof commit.commitment !== "string" ||
            !/^[0-9a-f]{64}$/.test(commit.commitment) ||
            typeof opening.salt !== "string" ||
            !/^[0-9a-f]{64}$/.test(opening.salt)
        ) return false
        return commitmentHex(context, canonicalBid(opening.bid), opening.salt) === commit.commitment
    } catch {
        return false
    }
}
