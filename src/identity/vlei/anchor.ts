import {
    demosAddressFromClaim,
    normalizeDemosAddress,
    type ClaimReference,
} from "@/identity/cci"
import { Demos } from "@/websdk/demosclass"
import { DemosTransactions } from "@/websdk/DemosTransactions"
import { StorageProgram } from "@/storage/StorageProgram"
import type { Transaction } from "@/types"
import { resolveNonce } from "@/utils"
import { verifyAttestation } from "./attestation"
import type { VleiAttestation } from "./types"

/**
 * Deterministic Storage Program name for `(subjectClaim, recordDigest)`. Public
 * so `resolveAttestation` can re-derive it. Components are percent-encoded so the
 * `:`-separated layout stays one-to-one (an un-encoded `:` inside a claim could
 * collide two different (subject, record) pairs onto the same SP name).
 */
export function attestationProgramName(subjectClaim: ClaimReference, recordDigest: string): string {
    return `vlei-attestation:${encodeURIComponent(subjectClaim)}:${encodeURIComponent(recordDigest)}`
}

export interface AnchorAttestationResult {
    storageAddress: string
    txHash: string
}

/**
 * Anchor a signed attestation to chain via SR-2 (Storage Program). The deployer
 * (= connected Demos wallet, which must control `attesterClaim`) becomes the SP
 * owner; that owner check is what makes `resolveAttestation` safe against an
 * impostor SP published under the same deterministic name.
 */
export async function anchorAttestation(
    att: VleiAttestation,
    demos: Demos,
    options?: { nonce?: number },
): Promise<AnchorAttestationResult> {
    if (!verifyAttestation(att)) {
        throw new Error("anchorAttestation: refusing to anchor an unverifiable attestation")
    }

    const attesterAddress = demosAddressFromClaim(att.attesterClaim)
    const connected = normalizeDemosAddress(await demos.getEd25519Address())
    if (attesterAddress !== connected) {
        throw new Error(
            `anchorAttestation: attesterClaim "${att.attesterClaim}" does not match connected wallet ${connected}`,
        )
    }

    const nonce = await resolveNonce(options?.nonce, () => demos.getAddressNonce(connected))
    const payload = StorageProgram.createStorageProgram(
        connected,
        attestationProgramName(att.subjectClaim, att.recordDigest),
        att as unknown as Record<string, unknown>,
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
 * Find the anchored, verified attestation for `(subjectClaim, recordDigest)`.
 *
 * Two-stage check on every candidate Storage Program:
 *   1. Embedded attester signature verifies under the embedded claim's key.
 *   2. SP owner's Demos address matches that claim's address — so only the actual
 *      key-holder could have deployed this SP under this name.
 *
 * Both must pass. Returns `null` when no candidate qualifies. A single malformed
 * candidate is skipped (not thrown) so a squatter cannot DoS the resolver.
 */
export async function resolveAttestation(
    subjectClaim: ClaimReference,
    recordDigest: string,
    rpcUrl: string,
): Promise<VleiAttestation | null> {
    const name = attestationProgramName(subjectClaim, recordDigest)
    const list = await StorageProgram.searchByName(rpcUrl, name, { exactMatch: true })

    for (const item of list) {
        const sp = await StorageProgram.getByAddress(rpcUrl, item.storageAddress)
        if (sp?.encoding !== "json" || !sp.data) continue
        if (typeof sp.data !== "object") continue

        const att = sp.data as unknown as VleiAttestation
        if (att.subjectClaim !== subjectClaim) continue
        if (att.recordDigest !== recordDigest) continue
        if (!verifyAttestation(att)) continue

        try {
            const attesterAddress = demosAddressFromClaim(att.attesterClaim)
            if (normalizeDemosAddress(sp.owner) !== attesterAddress) continue
        } catch {
            continue
        }

        return att
    }

    return null
}
