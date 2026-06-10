import type { ClaimReference } from "@/identity/cci"

/**
 * DACS-3 §8.3.2 interim membership binding.
 *
 * Until L2PS is natively CCI-keyed, each subnet member publishes one of
 * these so channel signatures can be tied back to the same identity used
 * in DACS-2. The signature MUST be produced by the key controlling
 * `cciPrimaryClaim` — on Demos, the Demos Ed25519 key (NOT the RSA subnet
 * key the L2PS class is configured with).
 */
export interface L2PSMembershipBinding {
    bindingVersion: "1"
    channelId: string
    subnetMemberId: string
    cciPrimaryClaim: ClaimReference
    boundAt: number
    /** Hex (0x-prefixed) Ed25519 signature over `bindingSigningBytes`. */
    signature: string
}

export type UnsignedL2PSMembershipBinding = Omit<
    L2PSMembershipBinding,
    "signature"
>
