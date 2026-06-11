import {
    demosAddressFromClaim,
    isDemosClaim,
    normalizeDemosAddress,
    signWithPrimaryClaim,
    verifyPrimaryClaimSignature,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { StorageProgram } from "@/storage/StorageProgram"
import type { Transaction } from "@/types"
import type {
    L2PSMembershipBinding,
    UnsignedL2PSMembershipBinding,
} from "./types"
import {
    bindingSigningBytes,
    signatureFromHex,
    signatureToHex,
    stripBindingSignature,
} from "./canonical"
import L2PS from "../l2ps"

/**
 * Deterministic Storage Program name for `(channelId, subnetMemberId)`.
 * Public so `resolveMember` can re-derive it; included verbatim in tests.
 */
export function bindingProgramName(
    channelId: string,
    subnetMemberId: string,
): string {
    return `l2ps-binding:${channelId}:${subnetMemberId}`
}

/**
 * Brief calls subnetMemberId "the member's L2PS/RSA identity within the
 * subnet". L2PS already publishes a stable fingerprint of the RSA key —
 * we reuse that so the value is derivable on both sides without a separate
 * registry.
 */
export async function subnetMemberIdFromL2PS(l2ps: L2PS): Promise<string> {
    return await l2ps.getKeyFingerprint()
}

export interface CreateMembershipBindingOpts {
    channelId: string
    subnetMemberId: string
    claim: ClaimReference
    demos: Demos
    /** Defaults to Date.now(). Useful for deterministic test fixtures. */
    boundAt?: number
}

/**
 * Build and sign a binding. The signature is produced by the key
 * controlling `claim`. Throws if `claim`'s scheme is not `demos:` or if
 * the controlling address does not match the connected wallet — the
 * invariant that ties channel signatures to on-chain identity.
 */
export async function createMembershipBinding(
    opts: CreateMembershipBindingOpts,
): Promise<L2PSMembershipBinding> {
    const { channelId, subnetMemberId, claim, demos } = opts
    if (!channelId) throw new Error("createMembershipBinding: channelId required")
    if (!subnetMemberId)
        throw new Error("createMembershipBinding: subnetMemberId required")
    if (!isDemosClaim(claim))
        throw new Error(
            `createMembershipBinding: claim must be a "demos:..." ClaimReference, got "${claim}"`,
        )

    const unsigned: UnsignedL2PSMembershipBinding = {
        bindingVersion: "1",
        channelId,
        subnetMemberId,
        cciPrimaryClaim: claim,
        boundAt: opts.boundAt ?? Date.now(),
    }

    const payload = bindingSigningBytes(unsigned)
    const sig = await signWithPrimaryClaim(claim, payload, demos)

    return { ...unsigned, signature: signatureToHex(sig) }
}

/**
 * Pure signature check — no chain access. Verifies the embedded signature
 * against the Demos public key encoded in `cciPrimaryClaim`.
 *
 * Returns `false` (not throws) on any structural problem so callers can
 * use it as a filter when iterating SP candidates in `resolveMember`.
 */
export function verifyMembershipBinding(
    binding: L2PSMembershipBinding,
): boolean {
    if (binding?.bindingVersion !== "1") return false
    if (!binding.channelId || !binding.subnetMemberId) return false
    if (!isDemosClaim(binding.cciPrimaryClaim)) return false
    if (typeof binding.signature !== "string" || !binding.signature)
        return false

    try {
        const payload = bindingSigningBytes(stripBindingSignature(binding))
        const sig = signatureFromHex(binding.signature)
        return verifyPrimaryClaimSignature(
            binding.cciPrimaryClaim,
            payload,
            sig,
        )
    } catch {
        return false
    }
}

export interface AnchorMembershipBindingResult {
    storageAddress: string
    txHash: string
}

/**
 * Anchor a signed binding to chain via SR-2 (Storage Program). The SP is
 * deployed under `bindingProgramName(...)` so `resolveMember` can find it
 * by name. The deployer (= connected Demos wallet) becomes the SP owner;
 * that owner check is what makes the resolver safe against impostor SPs
 * published under the same name.
 *
 * Returns once the broadcast succeeds. Callers that need on-chain finality
 * should poll the returned tx hash before opening the channel.
 */
export async function anchorMembershipBinding(
    binding: L2PSMembershipBinding,
    demos: Demos,
): Promise<AnchorMembershipBindingResult> {
    if (!verifyMembershipBinding(binding))
        throw new Error(
            "anchorMembershipBinding: refusing to anchor an unverifiable binding",
        )

    const claimAddress = demosAddressFromClaim(binding.cciPrimaryClaim)
    const connected = normalizeDemosAddress(await demos.getEd25519Address())
    if (claimAddress !== connected)
        throw new Error(
            `anchorMembershipBinding: claim "${binding.cciPrimaryClaim}" does not match connected wallet ${connected}`,
        )

    const nonce = (await demos.getAddressNonce(connected)) + 1
    const payload = StorageProgram.createStorageProgram(
        connected,
        bindingProgramName(binding.channelId, binding.subnetMemberId),
        binding as unknown as Record<string, unknown>,
        "json",
        { mode: "public" },
        { nonce },
    )

    const tx = DemosTransactions.empty() as Transaction
    tx.content.to = payload.storageAddress
    tx.content.nonce = nonce
    tx.content.amount = 0
    tx.content.type = "storageProgram"
    tx.content.timestamp = Date.now()
    tx.content.data = ["storageProgram", payload] as any

    const signed = await demos.sign(tx)
    const validity = await demos.confirm(signed)
    await demos.broadcast(validity)

    return { storageAddress: payload.storageAddress, txHash: signed.hash }
}

/**
 * Find the bound `ClaimReference` for `(channelId, subnetMemberId)`.
 *
 * Two-stage check on every candidate Storage Program:
 *   1. Embedded signature verifies under the embedded claim's key.
 *   2. SP owner's Demos address matches that claim's address — so only
 *      the actual key-holder could have deployed this SP under this name.
 *
 * Both checks must pass. Returns `null` when no candidate qualifies.
 * Membership is fixed for channel lifetime (CH-1) so callers SHOULD cache
 * the result for the session.
 */
export async function resolveMember(
    channelId: string,
    subnetMemberId: string,
    rpcUrl: string,
): Promise<ClaimReference | null> {
    const name = bindingProgramName(channelId, subnetMemberId)
    const list = await StorageProgram.searchByName(rpcUrl, name, {
        exactMatch: true,
    })

    for (const item of list) {
        const sp = await StorageProgram.getByAddress(rpcUrl, item.storageAddress)
        if (sp?.encoding !== "json" || !sp.data) continue
        if (typeof sp.data !== "object") continue

        const binding = sp.data as unknown as L2PSMembershipBinding
        if (binding.channelId !== channelId) continue
        if (binding.subnetMemberId !== subnetMemberId) continue
        if (!verifyMembershipBinding(binding)) continue

        // Both parses are inside the same try so a single adversarially-
        // crafted candidate (malformed claim ref OR malformed sp.owner)
        // gets skipped instead of aborting the whole resolution loop —
        // otherwise a squatter publishing a poisoned binding under our
        // deterministic name could deny-of-service every consumer.
        try {
            const claimAddress = demosAddressFromClaim(binding.cciPrimaryClaim)
            if (normalizeDemosAddress(sp.owner) !== claimAddress) continue
        } catch {
            continue
        }

        return binding.cciPrimaryClaim
    }

    return null
}
