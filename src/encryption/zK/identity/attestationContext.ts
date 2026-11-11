/**
 * The context identity attestations are proved under.
 *
 * The nullifier is Poseidon(provider_id, secret, context), so a context the
 * prover may choose freely gives one identity a fresh nullifier, and fresh
 * points, per context. Nodes therefore accept an attestation only under this
 * fixed context (`ATTESTATION_CONTEXT` in the node), checked on the proof's
 * public context signal.
 */
export const ZK_ATTESTATION_CONTEXT = "demos-identity-attestation-v1"

const BN254_SCALAR_FIELD = BigInt(
    "21888242871839275222246405745257275088548364400416034343698204186575808495617",
)

/**
 * A string as the circuit input the prover feeds it: its UTF-8 bytes read as
 * one big-endian number, reduced to the field. The witness calculator would
 * truncate an unreduced value to 256 bits instead, so the reduction keeps the
 * proof consistent with poseidon-lite, which reduces its inputs too.
 */
export function stringToFieldElement(str: string): bigint {
    const bytes = new TextEncoder().encode(str)
    const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
    return BigInt("0x" + hex) % BN254_SCALAR_FIELD
}

/**
 * The public context signal a proof under `context` carries, as the decimal
 * string snarkjs emits. For the default context it equals the node's
 * `ATTESTATION_CONTEXT_SIGNAL`.
 */
export function attestationContextSignal(
    context: string = ZK_ATTESTATION_CONTEXT,
): string {
    return stringToFieldElement(context).toString()
}
