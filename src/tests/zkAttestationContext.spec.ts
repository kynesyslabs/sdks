import { poseidon3 } from "poseidon-lite"
import {
    ZK_ATTESTATION_CONTEXT,
    attestationContextSignal,
    ZKIdentity,
} from "@/encryption/zK/identity"
import { generateAttestationNullifier } from "@/encryption/zK/identity/CommitmentService"

const fullProve = jest.fn(async (inputs: Record<string, string>) => ({
    proof: { pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["1", "2", "1"] },
    publicSignals: ["11", inputs.context, inputs.merkle_root],
}))
jest.mock("@cryptkeeperzk/snarkjs", () => ({ groth16: { fullProve } }))
jest.mock("@cryptkeeperzk/ffjavascript", () => ({ buildBn128: async () => ({}) }))
jest.mock("@/encryption/zK/identity/artifacts", () => ({
    IDENTITY_ARTIFACTS: { wasm: {}, zkey: {}, vkey: {} },
    loadArtifact: async () => new Uint8Array(),
}))

/**
 * Node vector: `ATTESTATION_CONTEXT_SIGNAL` in the node's
 * src/features/zk/proof/publicSignals.ts, i.e.
 * BigInt("0x" + Buffer.from("demos-identity-attestation-v1", "utf8").toString("hex")).toString(10).
 * Admission refuses an attestation whose context signal differs.
 */
const NODE_ATTESTATION_CONTEXT_SIGNAL =
    "2706676227265878361859323363879990891147005580244302981132320645150257"

describe("ZK identity attestation context", () => {
    const realFetch = globalThis.fetch
    afterEach(() => {
        globalThis.fetch = realFetch
        fullProve.mockClear()
    })

    it("is the node's fixed context, encoded as the node encodes it", () => {
        expect(ZK_ATTESTATION_CONTEXT).toBe("demos-identity-attestation-v1")
        expect(attestationContextSignal()).toBe(NODE_ATTESTATION_CONTEXT_SIGNAL)
        expect(attestationContextSignal(ZK_ATTESTATION_CONTEXT)).toBe(NODE_ATTESTATION_CONTEXT_SIGNAL)
    })

    it("proves under that context unless told otherwise, and checks the circuit's nullifier", async () => {
        const requested: string[] = []
        globalThis.fetch = (async (url: string) => {
            requested.push(url)
            if (url.includes("/zk/merkle/proof/")) {
                return new Response(
                    JSON.stringify({ proof: { siblings: [["0"]], pathIndices: [0], root: "7" } }),
                )
            }
            if (url.endsWith("/zk/merkle-root")) {
                return new Response(JSON.stringify({ rootHash: "7" }))
            }
            return new Response(JSON.stringify({ used: false }))
        }) as unknown as typeof fetch

        const identity = new ZKIdentity("github:12345", "a1b2c3")
        const payload = await identity.createAttestationTransaction("http://node.test")

        const inputs = fullProve.mock.calls[0][0]
        expect(inputs.context).toBe(NODE_ATTESTATION_CONTEXT_SIGNAL)
        expect(payload.public_signals[1]).toBe(NODE_ATTESTATION_CONTEXT_SIGNAL)
        expect(payload.merkle_root).toBe("7")

        // The circuit's nullifier is Poseidon(provider_id, secret, context)
        // over the inputs it was fed; the reuse check must look that one up.
        const circuitNullifier = poseidon3([
            BigInt(inputs.provider_id),
            BigInt(inputs.secret),
            BigInt(inputs.context),
        ]).toString()
        expect(
            generateAttestationNullifier("github:12345", "a1b2c3", ZK_ATTESTATION_CONTEXT),
        ).toBe(circuitNullifier)
        expect(requested).toContain(`http://node.test/zk/nullifier/${circuitNullifier}`)
    })
})
