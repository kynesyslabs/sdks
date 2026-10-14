import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"
import { hexToUint8Array } from "@/encryption/unifiedCrypto"

/**
 * The legacy proof signs the constant "dw2p". Since the proof text is
 * published on the claimed account, anyone who copies that post republishes a
 * valid proof under their own handle — and its signer can then claim that
 * handle. The bound shape ties the signature to the context, the handle and
 * the signer, so a copied proof proves nothing about a different claim.
 */
const MNEMONIC =
    "test test test test test test test test test test test junk"

async function connected() {
    const demos = new Demos()
    await demos.connectWallet(MNEMONIC, { algorithm: "ed25519" })
    return demos
}

/** Verify a raw message the way the node does: over the exact bytes. */
async function verifyOver(
    demos: Demos,
    message: string,
    signature: string,
    publicKey: string,
): Promise<boolean> {
    return await demos.crypto.verify({
        algorithm: "ed25519",
        message: new TextEncoder().encode(message),
        publicKey: hexToUint8Array(publicKey),
        signature: hexToUint8Array(signature),
    })
}

function signatureOf(payload: string): string {
    const parts = payload.split(":")
    return parts[3]
}

describe("web2 proof binding", () => {
    it("keeps the published tag so the node's parsers still find it", async () => {
        const demos = await connected()

        const payload = await new Identities().createWeb2ProofPayload(demos, {
            context: "twitter",
            username: "alice",
        })

        const parts = payload.split(":")
        expect(parts[0]).toBe("demos")
        expect(parts[1]).toBe("dw2p")
        expect(parts[2]).toBe("ed25519")
    })

    it("signs the context, handle and signer, not the bare constant", async () => {
        const demos = await connected()
        const sender = await demos.getEd25519Address()

        const payload = await new Identities().createWeb2ProofPayload(demos, {
            context: "twitter",
            username: "Alice",
        })

        const bound = `demos-web2:v1:twitter:alice:${sender.toLowerCase()}`
        await expect(
            verifyOver(demos, bound, signatureOf(payload), sender),
        ).resolves.toBe(true)
        await expect(
            verifyOver(demos, "dw2p", signatureOf(payload), sender),
        ).resolves.toBe(false)
    })

    it("produces a different proof per handle and per context", async () => {
        const demos = await connected()
        const identities = new Identities()

        const alice = await identities.createWeb2ProofPayload(demos, {
            context: "twitter",
            username: "alice",
        })
        const bob = await identities.createWeb2ProofPayload(demos, {
            context: "twitter",
            username: "bob",
        })
        const aliceGithub = await identities.createWeb2ProofPayload(demos, {
            context: "github",
            username: "alice",
        })

        expect(signatureOf(alice)).not.toBe(signatureOf(bob))
        expect(signatureOf(alice)).not.toBe(signatureOf(aliceGithub))
    })

    it("still signs the legacy constant when no claim is given", async () => {
        // Kept for nodes that predate the bound shape; the node accepts both
        // until its web2ProofBinding fork activates.
        const demos = await connected()
        const sender = await demos.getEd25519Address()

        const payload = await new Identities().createWeb2ProofPayload(demos)

        await expect(
            verifyOver(demos, "dw2p", signatureOf(payload), sender),
        ).resolves.toBe(true)
    })

    it("matches the signature bytes the node reconstructs", async () => {
        const demos = await connected()
        const sender = await demos.getEd25519Address()

        const payload = await new Identities().createWeb2ProofPayload(demos, {
            context: "discord",
            username: "someone",
        })

        // Byte-for-byte what the node builds in web2BoundProofMessage.
        const nodeSide = `demos-web2:v1:discord:someone:${sender.toLowerCase()}`
        const verified = await demos.crypto.verify({
            algorithm: "ed25519",
            message: new TextEncoder().encode(nodeSide),
            publicKey: hexToUint8Array(sender),
            signature: hexToUint8Array(signatureOf(payload)),
        })

        expect(verified).toBe(true)
    })
})
