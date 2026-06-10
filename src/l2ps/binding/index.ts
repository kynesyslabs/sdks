/**
 * L2PS membership binding — DACS-3 §8.3.2 (SR-4 WI-1).
 *
 * Anchors `(channelId, subnetMemberId) -> CCI ClaimReference` proofs to
 * chain via SR-2 Storage Programs so channel signatures can be verified
 * against the same identity used in DACS-2.
 */

export {
    BINDING_DOMAIN_PREFIX,
    bindingSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripBindingSignature,
} from "./canonical"

export type {
    L2PSMembershipBinding,
    UnsignedL2PSMembershipBinding,
} from "./types"

export {
    anchorMembershipBinding,
    bindingProgramName,
    createMembershipBinding,
    resolveMember,
    subnetMemberIdFromL2PS,
    verifyMembershipBinding,
    type AnchorMembershipBindingResult,
    type CreateMembershipBindingOpts,
} from "./binding"
