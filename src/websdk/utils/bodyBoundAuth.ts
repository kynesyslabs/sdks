import { Buffer } from "buffer"
import { Hashing } from "@/encryption/Hashing"

/**
 * Body-bound HTTP auth, the form a node requires for calls where the signer
 * decides what the call may do (such as `requestTLSNproxy`). The signature
 * covers the network, the identity, the timestamp, the SHA-256 of the exact
 * body bytes and, optionally, the node the call is for. Captured headers
 * then cannot carry another body, be replayed on another node or on another
 * network. Mirrors the node's `src/libs/network/peerHttpAuth.ts`; the two
 * must produce the same message byte for byte.
 */
export const HTTP_AUTH_DOMAIN = "DEMOS_HTTP_AUTH_V2"

/** Header carrying the hex SHA-256 of the body the signature covers. */
export const BODY_HASH_HEADER = "body-hash"

/** Header naming the receiving node by its public key hex. */
export const AUDIENCE_HEADER = "audience"

let lastAuthTimestamp = 0

/**
 * Past this lead the clock was set back; staying on the old sequence would
 * sign timestamps a node refuses as future-dated. Kept under the 5 s a node
 * allows a call that names it, so a clock stepped back by a few seconds does
 * not get every call refused until it catches up.
 */
const MAX_AUTH_TIMESTAMP_LEAD_MS = 2_000

/**
 * A timestamp strictly increasing within this process: two identical calls in
 * the same millisecond would otherwise sign the same message, and the node
 * refuses the second as a replay.
 */
export function nextAuthTimestamp(now = Date.now()): number {
    const next = lastAuthTimestamp + 1
    lastAuthTimestamp =
        next - now > MAX_AUTH_TIMESTAMP_LEAD_MS ? now : Math.max(now, next)
    return lastAuthTimestamp
}

/** A node public key as an audience names it: lowercase hex, no 0x. */
export function audienceKey(publicKeyHex: string): string {
    return publicKeyHex.toLowerCase().replace(/^0x/, "")
}

/** The hex message a body-bound signature signs (as its UTF-8 bytes). */
export function httpAuthMessage(
    genesisHash: string,
    identity: string,
    timestamp: string | number,
    bodyHash: string,
    audience?: string,
): string {
    const base = `${HTTP_AUTH_DOMAIN}:${genesisHash}:${identity}:${timestamp}:${bodyHash}`
    return Hashing.sha256(
        audience === undefined ? base : `${base}:${audience}`,
    )
}

/**
 * The auth headers of a body-bound request. `body` must be sent as exactly
 * these bytes; `sign` signs with the key `identity` ("algorithm:publicKeyHex")
 * names.
 */
export async function bodyBoundAuthHeaders(params: {
    genesisHash: string
    identity: string
    body: string
    sign: (message: Uint8Array) => Promise<Uint8Array>
    timestamp?: number
    /** The receiving node's public key hex. */
    audience?: string
}): Promise<Record<string, string>> {
    const timestamp = params.timestamp ?? nextAuthTimestamp()
    const bodyHash = Hashing.sha256(params.body)
    const audience =
        params.audience === undefined ? undefined : audienceKey(params.audience)
    const signature = await params.sign(
        new TextEncoder().encode(
            httpAuthMessage(
                params.genesisHash,
                params.identity,
                timestamp,
                bodyHash,
                audience,
            ),
        ),
    )
    return {
        identity: params.identity,
        signature: Buffer.from(signature).toString("hex"),
        timestamp: String(timestamp),
        [BODY_HASH_HEADER]: bodyHash,
        ...(audience === undefined ? {} : { [AUDIENCE_HEADER]: audience }),
    }
}
