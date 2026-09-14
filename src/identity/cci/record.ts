import type { AccountIdentities } from "@/types/gls/account"
import type { ClaimReference, ClaimScheme } from "@/identity/cci/types"

/**
 * How a linked claim was established — the trust story behind it.
 *
 * - `xm` — another chain's wallet, linked by a signature from that wallet.
 * - `web2` — a Web2 account, linked by a published proof.
 * - `pqc` — a post-quantum co-signer for the same account.
 */
export type CciLinkKind = "xm" | "web2" | "pqc"

/**
 * One identity linked to a primary claim.
 *
 * `claim` is the whole point: a linked identity expressed in the same currency
 * the rest of DACS speaks (`<scheme>:<identifier>`), so a caller can hand it
 * straight to `parseClaimRef` or match it against a counterparty's claim
 * instead of reaching into a chain-shaped blob.
 */
export interface CciLink {
    /** The linked identity as a claim — e.g. `evm:0x…`, `twitter:someone`. */
    claim: ClaimReference
    kind: CciLinkKind
    /** Sub-context within the kind: `evm` / `solana` for xm, `twitter` for web2. */
    context: string
    /** The raw entry the node returned, for anything this shape doesn't carry. */
    raw: unknown
}

/**
 * The full Cross-Context Identity record for an account: who it is on Demos,
 * plus every other identity it has proven control of.
 *
 * Until now the SDK only ever exposed the primary claim — the wallet key — so
 * consumers that needed "which Twitter/EVM identity is this agent?" had to
 * reach past the SDK and reassemble it themselves. This is that record.
 */
export interface CciRecord {
    /** The account's Demos claim — `demos:0x…`. */
    primary: ClaimReference
    /** The raw Demos address the record was fetched for. */
    address: string
    /** Every linked identity, flattened and expressed as claims. */
    links: CciLink[]
    /** The node's identities blob, unmodified. */
    raw: AccountIdentities | Record<string, unknown>
}

/**
 * Reading a chain-shaped identities blob is best-effort by nature: the node
 * grows new identity kinds (ud, nomis, humanpassport, ethos, tlsn) faster than
 * this type does, and a consumer asking "who is this agent" must not blow up
 * because a kind it has never heard of appeared. Unknown shapes are skipped,
 * and `raw` always carries the original.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v)
}

/**
 * Normalise an address for use inside a claim.
 *
 * Hex (`0x…`) addresses are case-insensitive — EVM checksum casing is a display
 * convention — so the node can hand back either spelling for the same wallet,
 * and a raw compare would call them different identities. Lowercase those.
 *
 * Everything else is left verbatim on purpose: base58 chains (Solana) are
 * case-SENSITIVE, and lowercasing one would corrupt the address into a
 * different (or invalid) account.
 *
 * @param address - The address as the node stored it.
 * @returns A stable spelling safe to compare.
 */
function normalizeLinkAddress(address: string): string {
    return /^0x[0-9a-fA-F]+$/.test(address) ? address.toLowerCase() : address
}

/** Flatten `xm.<chain>.<network>[]` into claims like `evm:0x…`. */
function xmLinks(xm: unknown): CciLink[] {
    if (!isRecord(xm)) return []
    const out: CciLink[] = []
    for (const [chain, networks] of Object.entries(xm)) {
        if (!isRecord(networks)) continue
        for (const entries of Object.values(networks)) {
            if (!Array.isArray(entries)) continue
            for (const e of entries) {
                const address = isRecord(e) ? e.address : undefined
                if (typeof address !== "string" || !address) continue
                out.push({
                    claim: `${chain}:${normalizeLinkAddress(address)}` as ClaimReference,
                    kind: "xm",
                    context: chain,
                    raw: e,
                })
            }
        }
    }
    return out
}

/** Flatten `web2.<platform>[]` into claims like `twitter:someone`. */
function web2Links(web2: unknown): CciLink[] {
    if (!isRecord(web2)) return []
    const out: CciLink[] = []
    for (const [platform, entries] of Object.entries(web2)) {
        if (!Array.isArray(entries)) continue
        for (const e of entries) {
            if (!isRecord(e)) continue
            // Prefer the human handle; fall back to the stable id.
            const handle = e.username ?? e.userId ?? e.id
            if (typeof handle !== "string" || !handle) continue
            out.push({
                claim: `${platform}:${handle}` as ClaimReference,
                kind: "web2",
                context: platform,
                raw: e,
            })
        }
    }
    return out
}

/**
 * Turn the node's identities blob into the flattened link list.
 *
 * Exported separately from the fetch so an indexer that already has the blob
 * (or a test) can get claims out of it without an RPC round-trip.
 *
 * @param identities - The `identities` object as returned by the node.
 * @returns Every linked identity it could express as a claim.
 */
export function cciLinksFrom(identities: unknown): CciLink[] {
    if (!isRecord(identities)) return []
    const links = [...xmLinks(identities.xm), ...web2Links(identities.web2)]

    // pqc is a co-signer for the same account rather than a separate identity,
    // so it is reported keyed by algorithm rather than as an address.
    if (isRecord(identities.pqc)) {
        for (const [algorithm, value] of Object.entries(identities.pqc)) {
            const key =
                typeof value === "string"
                    ? value
                    : isRecord(value) && typeof value.publicKey === "string"
                      ? value.publicKey
                      : undefined
            if (!key) continue
            links.push({
                claim: `${algorithm}:${key}` as ClaimReference,
                kind: "pqc",
                context: algorithm,
                raw: value,
            })
        }
    }
    return links
}

/** Every distinct scheme present in a record — handy for a quick capability check. */
export function cciSchemes(record: CciRecord): ClaimScheme[] {
    return [...new Set(record.links.map((l) => l.claim.slice(0, l.claim.indexOf(":"))))]
}

/**
 * Find the account's claim on a given scheme, if it has proven one.
 *
 * @param record - The CCI record.
 * @param scheme - e.g. `"evm"`, `"twitter"`.
 * @returns The first matching claim, or undefined.
 */
export function cciClaimFor(
    record: CciRecord,
    scheme: string,
): ClaimReference | undefined {
    return record.links.find((l) => l.context === scheme)?.claim
}
