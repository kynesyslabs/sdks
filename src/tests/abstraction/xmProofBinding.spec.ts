import { Wallet, verifyMessage } from "ethers"
import { Demos } from "@/websdk"
import {
    Identities,
    XM_PROOF_DOMAIN,
    canonicalXmAddress,
    xmBoundProofMessage,
} from "@/abstraction"

/**
 * Once `xmProofBinding` is active a node accepts an xm identity proof only
 * over `demos-xm:v1:<chain>:<address>:<sender>:<issuedAt>`, rebuilt on its
 * side from the payload and the transaction sender and compared as a string.
 * The vectors below are the node's own (src/libs/identity/xmProof.test.ts),
 * written out literally so any drift in the SDK's spelling fails here.
 */
const SENDER = "0x" + "AB".repeat(32)
const SENDER_LC = "0x" + "ab".repeat(32)
const NOW = 1_800_000_000_000

const MNEMONIC = "test test test test test test test test test test test junk"

async function connected() {
    const demos = new Demos()
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    return demos
}

describe("xm proof binding message", () => {
    it("reproduces the node's message byte for byte", () => {
        expect(XM_PROOF_DOMAIN).toBe("demos-xm:v1")
        expect(xmBoundProofMessage("xrpl", "rAbC", SENDER, NOW)).toBe(
            `demos-xm:v1:xrpl:rAbC:${SENDER_LC}:1800000000000`,
        )
        expect(xmBoundProofMessage("EVM", " 0xAbC ", SENDER, 1)).toBe(
            `demos-xm:v1:evm:0xabc:${SENDER_LC}:1`,
        )
        expect(xmBoundProofMessage("aptos", "0xAbC", SENDER, 1)).toBe(
            `demos-xm:v1:aptos:0xabc:${SENDER_LC}:1`,
        )
        expect(xmBoundProofMessage("solana", "AbC", SENDER, 1)).toBe(
            `demos-xm:v1:solana:AbC:${SENDER_LC}:1`,
        )
    })

    it("folds the address case only for evm and aptos", () => {
        expect(canonicalXmAddress("evm", "0xAbC")).toBe("0xabc")
        expect(canonicalXmAddress("APTOS", "0xAbC")).toBe("0xabc")
        expect(canonicalXmAddress("ton", "EQAbC")).toBe("EQAbC")
        expect(canonicalXmAddress("near", " Alice.near ")).toBe("Alice.near")
    })

    it("refuses an issuedAt the node cannot read back", () => {
        for (const bad of [1.5, -1, Number.NaN, 1e15, Number.MAX_SAFE_INTEGER]) {
            expect(() => xmBoundProofMessage("evm", "0xabc", SENDER, bad)).toThrow(
                "epoch milliseconds",
            )
        }
    })
})

describe("xm identity proof", () => {
    const identities = new Identities()
    const wallet = Wallet.fromPhrase(MNEMONIC)
    const target = {
        chain: "evm",
        subchain: "mainnet",
        chainId: 1,
        targetAddress: wallet.address,
        isEVM: true,
    }

    it("signs the bound message for the connected account", async () => {
        const demos = await connected()
        const sender = (await demos.getEd25519Address()).toLowerCase()

        const proof = await identities.createXmIdentityProof(
            demos,
            target,
            m => wallet.signMessage(m),
            { issuedAt: NOW },
        )

        const expected = `demos-xm:v1:evm:${wallet.address.toLowerCase()}:${sender}:${NOW}`
        expect(proof.method).toBe("identity_assign_from_signature")
        expect(proof.target_identity).toEqual({
            ...target,
            signedData: expected,
            signature: proof.target_identity.signature,
        })
        // The node's EVM check: the signer recovered from signedData is the target.
        expect(verifyMessage(expected, proof.target_identity.signature)).toBe(wallet.address)
        await expect(
            identities.createXmProofMessage(demos, "evm", wallet.address, NOW),
        ).resolves.toBe(expected)
    })

    it("keeps the signed target when the caller edits its object while signing", async () => {
        const demos = await connected()
        const mutable = { ...target }
        const proof = await identities.createXmIdentityProof(
            demos,
            mutable,
            async m => {
                mutable.targetAddress = "0x" + "11".repeat(20)
                mutable.chain = "solana"
                return wallet.signMessage(m)
            },
            { issuedAt: NOW },
        )
        expect(proof.target_identity.targetAddress).toBe(wallet.address)
        expect(proof.target_identity.chain).toBe("evm")
        expect(proof.target_identity.signedData).toContain(`:evm:${wallet.address.toLowerCase()}:`)
    })

    it("stamps the current time by default", async () => {
        const demos = await connected()
        const before = Date.now()
        const proof = await identities.createXmIdentityProof(demos, target, m =>
            wallet.signMessage(m),
        )
        const issuedAt = Number(proof.target_identity.signedData.split(":").pop())
        expect(issuedAt).toBeGreaterThanOrEqual(before)
        expect(issuedAt).toBeLessThanOrEqual(Date.now())
    })

    it("still signs the account address when asked for the legacy proof", async () => {
        const demos = await connected()
        const proof = await identities.createXmIdentityProof(
            demos,
            target,
            m => wallet.signMessage(m),
            { legacy: true },
        )
        const sender = await demos.getEd25519Address()
        expect(proof.target_identity.signedData).toBe(sender)
        expect(verifyMessage(sender, proof.target_identity.signature)).toBe(wallet.address)
    })
})
