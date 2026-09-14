import { Identities } from "@/abstraction/Identities"
import { Demos } from "@/websdk/demosclass"
import type { AccountIdentities } from "@/types/gls/account"
import {
    demosAddressFromClaim,
    demosClaimRefForAddress,
    isDemosClaim,
    normalizeDemosAddress,
} from "@/identity/cci/claim"
import { cciLinksFrom, type CciRecord } from "@/identity/cci/record"
import type { ClaimReference } from "@/identity/cci/types"

const identities = new Identities()

/**
 * Fetch the full CCI record for an account: its Demos claim plus every identity
 * it has proven control of.
 *
 * This is the seam DACS was missing. `signWithPrimaryClaim` and friends only
 * ever knew an account as its wallet key, so a consumer that needed the agent's
 * linked Web2/other-chain identities had to go around the SDK and reassemble
 * the record itself. Now the whole identity comes back in one call, with the
 * links expressed as `ClaimReference`s — the same currency the rest of DACS
 * speaks.
 *
 * Identities are public data: no wallet is needed to read someone else's record,
 * which is what lets an indexer or a verifier resolve a counterparty. Omit
 * `subject` to read the connected wallet's own.
 *
 * @param demos - A connected-to-RPC Demos instance.
 * @param subject - A `demos:0x…` claim or a raw Demos address. Defaults to the
 * connected wallet.
 * @returns The account's CCI record. An account with no links returns an empty
 * `links` array — that is a valid answer, not an error.
 * @throws If `subject` is a non-demos claim, is malformed, or is omitted with no
 * wallet connected.
 */
export async function resolveCciRecord(
    demos: Demos,
    subject?: ClaimReference | string,
): Promise<CciRecord> {
    const address = await resolveAddress(demos, subject)

    const response = (await identities.getIdentities(
        demos,
        "getIdentities",
        address,
    )) as { result?: number; response?: unknown; extra?: { error?: string } } | unknown

    const raw = unwrap(response)
    return {
        primary: demosClaimRefForAddress(address),
        address: normalizeDemosAddress(address),
        links: cciLinksFrom(raw),
        raw: (raw ?? {}) as AccountIdentities | Record<string, unknown>,
    }
}

/** Accept a claim or a bare address, and fall back to the connected wallet. */
async function resolveAddress(
    demos: Demos,
    subject?: ClaimReference | string,
): Promise<string> {
    if (!subject) {
        if (!demos.walletConnected)
            throw new Error(
                "resolveCciRecord: no subject given and no wallet connected. " +
                    "Pass a claim or address to read a specific account, or connect a wallet to read your own.",
            )
        return await demos.getEd25519Address()
    }
    if (subject.includes(":")) {
        if (!isDemosClaim(subject as ClaimReference))
            throw new Error(
                `resolveCciRecord: subject must be a demos: claim or a Demos address, got "${subject}". ` +
                    "A record is keyed by the Demos account; other schemes appear as its links.",
            )
        return demosAddressFromClaim(subject as ClaimReference)
    }
    return normalizeDemosAddress(subject)
}

/**
 * The RPC wrapper is inconsistent across node versions — some calls hand back
 * the identities blob directly, others wrap it in an RPCResponse. Unwrap either
 * rather than making every caller guess which one they got.
 */
function unwrap(response: unknown): unknown {
    if (!response || typeof response !== "object") return response
    const r = response as Record<string, unknown>
    // Check the error BEFORE looking for `response`: an RPC error may carry no
    // `response` key at all, and returning it verbatim would hand the caller an
    // error object dressed up as an identities blob.
    if (typeof r.result === "number" && r.result >= 400)
        throw new Error(
            `resolveCciRecord: node returned ${r.result}: ${
                (r.extra as { error?: string } | undefined)?.error ?? "unknown error"
            }`,
        )
    if (!("response" in r)) return response
    return r.response
}
