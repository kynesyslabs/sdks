/**
 * Cross-Context Identity (CCI) — primary-claim binding for DACS-3 SR-4, and
 * the full identity record behind it.
 *
 * Two layers:
 * - the primary claim — who an account is on Demos, and the key that signs as
 *   it. Used by L2PS membership binding (WI-1), ChannelMessage envelope signing
 *   (WI-2), and encrypted-transcript anchoring (WI-3).
 * - the record — every OTHER identity that account has proven control of
 *   (other-chain wallets, Web2 accounts), expressed as claims. See
 *   `resolveCciRecord`.
 *
 * Brief: `docs/l2ps-sr4-implementation-brief.md` in the node repo.
 */

export type { ClaimReference, ClaimScheme, ParsedClaimRef } from "./types"

export {
    demosClaimRefForAddress,
    demosAddressFromClaim,
    isDemosClaim,
    normalizeDemosAddress,
    parseClaimRef,
} from "./claim"

export {
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
} from "./signing"

export type { CciLink, CciLinkKind, CciRecord } from "./record"

export { cciClaimFor, cciLinksFrom, cciSchemes } from "./record"

export { resolveCciRecord } from "./resolve"
