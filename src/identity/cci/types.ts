/**
 * Cross-Context Identity (CCI) — type definitions.
 *
 * A ClaimReference is the label that names an identity across substrates.
 * It is NOT a key; the key controlling the claim signs in-channel messages.
 * See `docs/l2ps-sr4-implementation-brief.md` §0 in the node repo for the
 * full claim-vs-key distinction.
 */

export type ClaimScheme = "demos" | (string & {})

export type ClaimReference = `${string}:${string}`

export interface ParsedClaimRef {
    scheme: ClaimScheme
    identifier: string
}
