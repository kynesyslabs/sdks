import { poseidon2 } from "poseidon-lite"
import { generateCommitment, generateSecret } from "@/encryption/zK/identity/CommitmentService"
import { generateIdentityProof } from "@/encryption/zK/identity/ProofGenerator"

const fullProve = jest.fn(async () => ({
    proof: { pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["1", "2", "1"] },
    publicSignals: ["1", "2", "3"],
}))
jest.mock("@cryptkeeperzk/snarkjs", () => ({ groth16: { fullProve } }))
jest.mock("@cryptkeeperzk/ffjavascript", () => ({ buildBn128: async () => ({}) }))
jest.mock("@/encryption/zK/identity/artifacts", () => ({
    IDENTITY_ARTIFACTS: { wasm: {}, zkey: {}, vkey: {} },
    loadArtifact: async () => new Uint8Array(),
}))

const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617")

describe("identity circuit inputs", () => {
    it("are field elements whose Poseidon hash is the registered commitment", async () => {
        const providerId = "github:loadgen-1234567890"
        const secret = generateSecret()
        const merkleProof = { siblings: [["0"]], pathIndices: [0], root: "0", leaf: "0" }
        await generateIdentityProof(providerId, secret, "a context longer than thirty-one bytes", merkleProof, "0")

        const inputs = (fullProve.mock.calls[0] as unknown as [Record<string, string>])[0]
        for (const name of ["provider_id", "secret", "context"]) {
            expect(BigInt(inputs[name])).toBeLessThan(FIELD)
        }
        expect(poseidon2([BigInt(inputs.provider_id), BigInt(inputs.secret)]).toString()).toBe(
            generateCommitment(providerId, secret),
        )
    })
})
