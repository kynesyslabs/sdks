import { sha256 } from "@noble/hashes/sha2"
import { canonicalJSONStringify } from "@/websdk/utils/canonicalJson"
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
import L2PS from "../l2ps"
import type {
    ChannelTranscript,
    UnsignedChannelTranscript,
} from "../channel/types"
import {
    stripTranscriptSignatures,
    transcriptSigningBytes,
} from "../channel/canonical"
import { verifyTranscript } from "../channel/transcript"
import { bytesToHex, signatureFromHex, signatureToHex } from "../utils/hex"
import type {
    AnchoredTranscriptPayload,
    AttestationRef,
    TranscriptDisclosurePolicy,
} from "./types"

/**
 * Deterministic per-channel Storage Program name. One anchor per
 * channelId; a redo of the same channel reuses the slot (the SP's
 * `mode: "owner"` ACL guarantees only the original signer can overwrite).
 *
 * @param channelId - Per-session `channelId` (matches `ChannelTranscript.channelId`).
 * @returns         The SR-2 program name used by `anchorEncryptedTranscript`.
 */
export function anchorProgramName(channelId: string): string {
    return `l2ps-transcript:${encodeURIComponent(channelId)}`
}

export interface AnchorEncryptedTranscriptOpts {
    transcript: ChannelTranscript
    /** Provides the AES-GCM key for encrypt-to-member-set. */
    l2ps: L2PS
    demos: Demos
    /** Must be a member of `transcript.members` and match the connected Demos wallet. */
    signer: ClaimReference
    policy: TranscriptDisclosurePolicy
    /** Required to actually anchor when `policy === "encrypted-anchored-recommended"`. */
    consent?: boolean
}

/**
 * §8.7 anchor entrypoint. Encrypts a `ChannelTranscript` to the L2PS
 * member set, anchors the ciphertext via SR-2, and signs the plaintext
 * hash with the connected Demos key.
 *
 * Policy behaviour:
 * - `none`            → throws (caller should not have invoked this).
 * - `recommended`     → only anchors when `consent === true`; otherwise returns `null`.
 * - `required`        → always anchors; broadcast failures propagate so
 *                       the caller's phase can fail per §8.7.
 *
 * The SP is deployed via SR-2 with `mode: "public"` (anyone reads the
 * ciphertext + the public content hash for tamper-evidence; only the
 * owner can overwrite).
 *
 * @param opts - Transcript + L2PS instance (for the AES-GCM key) +
 *               connected Demos (for the signing key + broadcast) +
 *               signer claim + policy/consent.
 * @returns   `{ anchor, contentHash }` on success, `null` only when the
 *            recommended policy is in effect and consent is missing.
 * @throws {Error} On `policy === "none"`, non-demos signer, non-member
 *                 signer, signer-wallet mismatch, or broadcast failure
 *                 under `required` policy.
 */
export async function anchorEncryptedTranscript(
    opts: AnchorEncryptedTranscriptOpts,
): Promise<AttestationRef | null> {
    if (opts.policy === "none") {
        throw new Error(
            "anchorEncryptedTranscript: policy is 'none' — do not call this helper",
        )
    }
    if (
        opts.policy === "encrypted-anchored-recommended" &&
        opts.consent !== true
    ) {
        return null
    }
    if (!isDemosClaim(opts.signer)) {
        throw new Error(
            `anchorEncryptedTranscript: signer must be a demos: ClaimReference, got "${opts.signer}"`,
        )
    }
    if (!opts.transcript.members.includes(opts.signer)) {
        throw new Error(
            `anchorEncryptedTranscript: signer "${opts.signer}" is not in transcript.members`,
        )
    }
    const signerAddress = demosAddressFromClaim(opts.signer)
    const connected = normalizeDemosAddress(await opts.demos.getEd25519Address())
    if (signerAddress !== connected) {
        throw new Error(
            `anchorEncryptedTranscript: signer "${opts.signer}" does not match connected wallet ${connected}`,
        )
    }

    const unsignedView = stripTranscriptSignatures(opts.transcript)
    const plaintextBytes = new TextEncoder().encode(
        canonicalJSONStringify(unsignedView),
    )

    const encrypted = await opts.l2ps.encryptBytes(plaintextBytes)
    const contentHash = bytesToHex(
        sha256(base64ToBytes(encrypted.ciphertext)),
    )

    const sigBytes = await signWithPrimaryClaim(
        opts.signer,
        transcriptSigningBytes(unsignedView),
        opts.demos,
    )

    const payload: AnchoredTranscriptPayload = {
        transcriptVersion: "1",
        channelId: opts.transcript.channelId,
        encrypted,
        contentHash,
        signature: {
            sigVersion: "1",
            signer: opts.signer,
            signature: signatureToHex(sigBytes),
        },
    }

    const storageAddress = await deployAnchorSP(
        opts.demos,
        anchorProgramName(opts.transcript.channelId),
        payload,
    )

    return { anchor: storageAddress, contentHash }
}

async function deployAnchorSP(
    demos: Demos,
    programName: string,
    payload: AnchoredTranscriptPayload,
): Promise<string> {
    const deployer = normalizeDemosAddress(await demos.getEd25519Address())
    const nonce = (await demos.getAddressNonce(deployer)) + 1
    const spPayload = StorageProgram.createStorageProgram(
        deployer,
        programName,
        payload as unknown as Record<string, unknown>,
        "json",
        { mode: "public" },
        { nonce },
    )

    const tx = DemosTransactions.empty() as Transaction
    tx.content.to = spPayload.storageAddress
    tx.content.nonce = nonce
    tx.content.amount = 0
    tx.content.type = "storageProgram"
    tx.content.timestamp = Date.now()
    tx.content.data = ["storageProgram", spPayload] as any

    const signed = await demos.sign(tx)
    const validity = await demos.confirm(signed)
    await demos.broadcast(validity)

    return spPayload.storageAddress
}

export interface DecryptAnchoredTranscriptOpts {
    rpcUrl: string
    storageAddress: string
    l2ps: L2PS
}

/**
 * Fetch + decrypt + fully verify the original transcript.
 *
 * @param opts - RPC URL + Storage Program address + L2PS instance (caller
 *               must be a subnet member; otherwise AES-GCM auth fails).
 * @returns   A `ChannelTranscript` whose every component has been
 *            validated end-to-end — callers do not need to run
 *            `verifyTranscript` again.
 * @throws {Error} On the first of:
 *   - SP not found / wrong shape / unknown transcriptVersion
 *   - ciphertext hash does not match the stored `contentHash` (tamper)
 *   - AES-GCM auth fails (= caller's L2PS instance is not a subnet member)
 *   - decrypted `channelId` does not match the anchor's `channelId`
 *   - anchor-party transcript signature is invalid
 *   - any embedded ChannelMessage signature, sequence, sender ∈ members,
 *     or per-message channelId check fails (delegated to `verifyTranscript`).
 */
export async function decryptAnchoredTranscript(
    opts: DecryptAnchoredTranscriptOpts,
): Promise<ChannelTranscript> {
    const sp = await StorageProgram.getByAddress(
        opts.rpcUrl,
        opts.storageAddress,
    )
    if (!sp?.data || typeof sp.data !== "object")
        throw new Error(
            `decryptAnchoredTranscript: no storage program at ${opts.storageAddress}`,
        )

    const payload = sp.data as unknown as AnchoredTranscriptPayload
    if (payload.transcriptVersion !== "1")
        throw new Error("decryptAnchoredTranscript: unknown transcriptVersion")

    const ctHash = bytesToHex(
        sha256(base64ToBytes(payload.encrypted.ciphertext)),
    )
    if (ctHash !== payload.contentHash)
        throw new Error(
            "decryptAnchoredTranscript: ciphertext hash does not match stored contentHash (tamper)",
        )

    const plaintext = await opts.l2ps.decryptBytes(payload.encrypted)
    const transcript = JSON.parse(
        new TextDecoder().decode(plaintext),
    ) as UnsignedChannelTranscript

    if (transcript.channelId !== payload.channelId)
        throw new Error(
            "decryptAnchoredTranscript: decrypted channelId does not match anchor channelId",
        )

    const sigOk = verifyPrimaryClaimSignature(
        payload.signature.signer,
        transcriptSigningBytes(transcript),
        signatureFromHex(payload.signature.signature),
    )
    if (!sigOk)
        throw new Error(
            "decryptAnchoredTranscript: transcript signature verification failed",
        )

    const fullTranscript: ChannelTranscript = {
        ...transcript,
        signatures: [payload.signature],
    }

    // Run the audit verifier on the assembled transcript so the caller's
    // return value is end-to-end validated, not just the anchor wrapper.
    const audit = verifyTranscript(fullTranscript)
    if (!audit.ok)
        throw new Error(
            `decryptAnchoredTranscript: transcript audit failed — ${audit.errors.join("; ")}`,
        )

    return fullTranscript
}

export interface VerifyAnchorIntegrityResult {
    ok: boolean
    errors: string[]
}

/**
 * Public tamper-check that needs no decryption keys. Hashes the on-chain
 * ciphertext and compares with the stored `contentHash`; also asserts the
 * SP owner address matches the embedded signer's CCI claim. Useful for
 * auditors and non-members verifying an anchor without subnet access.
 *
 * @param opts - RPC URL + Storage Program address.
 * @returns   `{ ok, errors }` — `ok` only when every public check passes;
 *            `errors` contains every failure (collected in one pass so
 *            auditors see the full picture, not the first failure).
 */
export async function verifyAnchorIntegrity(opts: {
    rpcUrl: string
    storageAddress: string
}): Promise<VerifyAnchorIntegrityResult> {
    const errors: string[] = []
    const sp = await StorageProgram.getByAddress(
        opts.rpcUrl,
        opts.storageAddress,
    )
    if (!sp?.data || typeof sp.data !== "object") {
        errors.push(`no storage program at ${opts.storageAddress}`)
        return { ok: false, errors }
    }
    const payload = sp.data as unknown as AnchoredTranscriptPayload
    if (payload.transcriptVersion !== "1")
        errors.push(`unknown transcriptVersion ${payload.transcriptVersion}`)

    try {
        const hash = bytesToHex(
            sha256(base64ToBytes(payload.encrypted.ciphertext)),
        )
        if (hash !== payload.contentHash)
            errors.push("ciphertext hash does not match stored contentHash")
    } catch (e) {
        errors.push(`hash check failed: ${(e as Error).message}`)
    }

    try {
        const signerAddress = demosAddressFromClaim(payload.signature.signer)
        if (normalizeDemosAddress(sp.owner) !== signerAddress)
            errors.push(
                `storage program owner ${sp.owner} does not match signer claim ${payload.signature.signer}`,
            )
    } catch (e) {
        errors.push(
            `signer claim address check failed: ${(e as Error).message}`,
        )
    }

    return { ok: errors.length === 0, errors }
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = Buffer.from(b64, "base64")
    return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
}
