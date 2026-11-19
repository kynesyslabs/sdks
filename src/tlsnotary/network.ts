/**
 * Which notary an attestation trusts, and what the network accepts.
 *
 * On mainnet the notary keys are fixed by the `tlsnVerified` fork payload in
 * the genesis, and validators do not run a notary, so a node may not answer
 * `tlsnotary.getInfo` at all. The SDK therefore pins the mainnet notary here
 * instead of trusting whatever key an RPC reports.
 */

import type { NetworkInfo } from "@/denomination/networkInfo"

/** Marks a value that is filled in after the notary key ceremony. */
export const TLSN_PLACEHOLDER_PREFIX = "FILL:"

/** Mainnet chain id, from the mainnet genesis `properties.id`. */
export const TLSN_MAINNET_CHAIN_ID = 8587492

/**
 * Mainnet notary endpoint.
 *
 * PLACEHOLDER: set to the Demos notary URL before the first release that
 * targets mainnet. While it is a placeholder, attesting on mainnet throws.
 */
export const TLSN_MAINNET_NOTARY_URL: string =
    "FILL: Demos mainnet notary URL, set after the notary deployment"

/**
 * Mainnet notary public keys, as the verifier reports them: 33-byte
 * compressed secp256k1, lowercase hex. The same list as the `notaryKeys` of
 * the mainnet `tlsnVerified` genesis entry (a primary and a cold standby).
 *
 * PLACEHOLDER: filled from the notary key ceremony. A placeholder never
 * matches a presentation, so verification on mainnet fails closed until then.
 */
export const TLSN_MAINNET_NOTARY_KEYS: readonly {
    id: string
    alg: "k256"
    hex: string
}[] = Object.freeze([
    {
        id: "demos-notary-1",
        alg: "k256",
        hex: "FILL: primary notary public key from the notary key ceremony",
    },
    {
        id: "demos-notary-standby",
        alg: "k256",
        hex: "FILL: cold standby notary public key from the notary key ceremony",
    },
])

/**
 * Largest presentation, in bytes, that a node verifies or stores when it
 * does not report its own limit. The mainnet genesis value.
 */
export const TLSN_DEFAULT_MAX_PRESENTATION_BYTES = 65536

/**
 * The mainnet `freshnessWindowSec`: nodes refuse a store or identity link
 * whose attestation is older than this at its block's time ("attestation is
 * stale"), even while its 500-block `tlsn_request` token is still valid.
 */
export const TLSN_ATTESTATION_MAX_AGE_SECONDS = 3600

export const isTlsnPlaceholder = (value: string) =>
    value.trim().startsWith(TLSN_PLACEHOLDER_PREFIX)

/** Whether the node verifies TLSNotary presentations itself. */
export function isTlsnVerifiedActive(info: NetworkInfo | null | undefined): boolean {
    return info?.forks?.tlsnVerified?.activated === true
}

/**
 * Whether the network links GitHub, Discord and Twitter accounts through
 * TLSNotary only (`keylessWeb2Identity`), so validators need no platform API
 * keys and refuse the web2 proof-URL path for those contexts.
 */
export function isKeylessWeb2IdentityActive(info: NetworkInfo | null | undefined): boolean {
    return info?.forks?.keylessWeb2Identity?.activated === true
}

/** The notary an attestation should use and trust. */
export interface ResolvedNotary {
    notaryUrl: string
    /** Keys a presentation must be signed by. */
    trustedNotaryKeys: string[]
    /** Largest presentation the network stores. */
    maxPresentationBytes: number
    /** True when the endpoint and keys come from the SDK's mainnet pins. */
    pinned: boolean
}

/** The slice of `Demos` the resolver needs; kept narrow for tests. */
export interface NotaryResolverHost {
    getNetworkInfo(): Promise<NetworkInfo | null>
    nodeCall(message: any, args?: any): Promise<any>
}

/** The presentation size limit a `tlsnotary.getInfo` answer reports, or the mainnet value. */
export function reportedMaxPresentationBytes(info: any): number {
    const reported = info?.maxPresentationBytes
    return typeof reported === "number" && Number.isInteger(reported) && reported > 0
        ? reported
        : TLSN_DEFAULT_MAX_PRESENTATION_BYTES
}

/**
 * Resolve the notary for the connected network.
 *
 * Mainnet uses the pinned URL and keys and refuses to run while they are
 * placeholders. Other networks (devnets, rehearsals) use what the node's
 * `tlsnotary.getInfo` reports.
 */
export async function resolveNotary(host: NotaryResolverHost): Promise<ResolvedNotary> {
    const network = await host.getNetworkInfo()
    let info: any = null
    try {
        info = await host.nodeCall("tlsnotary.getInfo", {})
    } catch {
        info = null
    }

    if (network?.chainId === TLSN_MAINNET_CHAIN_ID) {
        const keys = TLSN_MAINNET_NOTARY_KEYS.map(k => k.hex).filter(
            k => !isTlsnPlaceholder(k),
        )
        if (isTlsnPlaceholder(TLSN_MAINNET_NOTARY_URL) || keys.length === 0) {
            throw new Error(
                "This SDK build has no mainnet TLSNotary notary pinned yet (placeholders in tlsnotary/network.ts). Use a release that pins the notary from the key ceremony.",
            )
        }
        return {
            notaryUrl: TLSN_MAINNET_NOTARY_URL,
            trustedNotaryKeys: keys,
            maxPresentationBytes: reportedMaxPresentationBytes(info),
            pinned: true,
        }
    }

    if (!info?.notaryUrl) {
        throw new Error(
            "Node does not support TLSNotary or tlsnotary.getInfo failed. Provide explicit config or use a node with TLSNotary enabled.",
        )
    }
    return {
        notaryUrl: info.notaryUrl,
        trustedNotaryKeys: typeof info.publicKey === "string" && info.publicKey ? [info.publicKey] : [],
        maxPresentationBytes: reportedMaxPresentationBytes(info),
        pinned: false,
    }
}
