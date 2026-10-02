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
 * Why an anchor was not confirmed as accepted. `refused` is the node saying no
 * (a 4xx): the transaction is not pending and may be resent. `unknown` means
 * the outcome is not known (a 5xx, or no usable response): the transaction may
 * still land, so check `txHash` before sending another anchor.
 */
export class AnchorBroadcastError extends Error {
    constructor(
        readonly outcome: "refused" | "unknown",
        readonly txHash: string,
        readonly storageAddress: string,
        readonly result: unknown,
        reason: string,
    ) {
        super(
            outcome === "refused"
                ? `anchorAttestation: the node refused the anchor transaction ${txHash} (${String(result)}): ${reason}`
                : `anchorAttestation: the outcome of anchor transaction ${txHash} is unknown (${String(result)}): ${reason}; check the hash before resending`,
        )
        this.name = "AnchorBroadcastError"
    }
}

/**
 * Anchor a signed attestation to chain via SR-2 (Storage Program). The deployer
 * (= connected Demos wallet, which must control `attesterClaim`) becomes the SP
 * owner; that owner check is what stops an impostor SP published under the same
 * deterministic name from speaking for this attester in `resolveAttestation`.
 *
 * Resolves once the node has accepted the transaction for inclusion; it does
 * not wait for the block. Throws {@link AnchorBroadcastError} otherwise, saying
 * whether the node refused it or the outcome is unknown.
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

    const nonce = await resolveNonce(
        options?.nonce,
        () => demos.getAddressNonce(connected),
        demos._nonceReserver(connected),
    )
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
    const broadcast = await demos.broadcast(validity)
    // broadcast reports a node refusal, and a transport failure, in its result
    // rather than throwing.
    if (broadcast?.result !== 200) {
        const result = broadcast?.result
        const response = broadcast?.response
        const reason =
            typeof response === "string"
                ? response
                : ((response as Error)?.message ?? JSON.stringify(response ?? null))
        const refused =
            typeof result === "number" && result >= 400 && result < 500
        throw new AnchorBroadcastError(
            refused ? "refused" : "unknown",
            signed.hash,
            payload.storageAddress,
            result,
            reason,
        )
    }

    return { storageAddress: payload.storageAddress, txHash: signed.hash }
}

export interface ResolveAttestationOpts {
    /**
     * Attesters whose word the caller accepts, as `demos:` claims or bare Demos
     * addresses. Required and non-empty: signature + owner checks only prove a
     * candidate is self-consistent, and anyone can anchor a self-consistent
     * attestation under the same deterministic name.
     */
    trustedAttesters: string[]
}

function attesterAddressOf(ref: string): string {
    return ref.includes(":") ? demosAddressFromClaim(ref as ClaimReference) : normalizeDemosAddress(ref)
}

/**
 * Find the anchored, verified attestation for `(subjectClaim, recordDigest)`
 * issued by one of `opts.trustedAttesters`.
 *
 * Three checks on every candidate Storage Program:
 *   1. Embedded attester signature verifies under the embedded claim's key.
 *   2. SP owner's Demos address matches that claim's address — so only the actual
 *      key-holder could have deployed this SP under this name.
 *   3. That address is one of the caller's trusted attesters.
 *
 * All must pass. Returns `null` when no candidate qualifies. A single malformed
 * candidate is skipped (not thrown) so a squatter cannot DoS the resolver.
 *
 * @throws If `trustedAttesters` is empty or holds an unparseable entry.
 */
export async function resolveAttestation(
    subjectClaim: ClaimReference,
    recordDigest: string,
    rpcUrl: string,
    opts: ResolveAttestationOpts,
): Promise<VleiAttestation | null> {
    if (!opts?.trustedAttesters?.length) {
        throw new Error("resolveAttestation: trustedAttesters must name at least one attester")
    }
    const trusted = new Set(opts.trustedAttesters.map(attesterAddressOf))

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
            if (!trusted.has(attesterAddress)) continue
            if (normalizeDemosAddress(sp.owner) !== attesterAddress) continue
        } catch {
            continue
        }

        return att
    }

    return null
}
