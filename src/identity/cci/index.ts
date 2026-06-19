/**
 * Cross-Context Identity (CCI) — primary-claim binding for DACS-3 SR-4.
 *
 * Public surface used by L2PS membership binding (WI-1), ChannelMessage
 * envelope signing (WI-2), and encrypted-transcript anchoring (WI-3).
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
