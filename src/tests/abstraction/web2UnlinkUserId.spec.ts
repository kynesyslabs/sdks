import { Demos } from "@/websdk"
import { Identities } from "@/abstraction"
import { GCRGeneration } from "@/websdk/GCRGeneration"
import { Hashing } from "@/encryption"

/**
 * Web2 and TLSN unlinks may name the platform account by `userId`, since a
 * username alone can match two links. The builders run for real, with a
 * connected wallet and a real signature; only the node round trip is
 * stubbed, and `confirm` hands back the signed transaction.
 */
async function signingDemos(): Promise<{ demos: Demos; signed: any[] }> {
    const demos = new Demos()
    ;(demos as any).nodeCall = async (message: string) =>
        message === "getAddressNonce" ? 3 : null
    await demos.connectWallet(demos.newMnemonic())

    const signed: any[] = []
    jest.spyOn(demos, "confirm").mockImplementation(async (tx: any) => {
        signed.push(tx)
        return tx
    })
    return { demos, signed }
}

const payloadOf = (tx: any) => tx.content.data[1].payload

async function editData(tx: any) {
    const edits = await GCRGeneration.generate(tx)
    return (edits.find(e => e.type === "identity") as any).data
}

describe("web2 unlink by userId", () => {
    const identities = new Identities()

    it("sends the userId as a string and passes it through to the GCR edit", async () => {
        const { demos, signed } = await signingDemos()
        await identities.removeWeb2Identity(demos, {
            context: "github",
            username: "alice",
            userId: 7,
        })

        const tx = signed[0]
        expect(tx.content.data[1].method).toBe("web2_identity_remove")
        expect(payloadOf(tx)).toEqual({ context: "github", username: "alice", userId: "7" })
        expect(tx.signature?.data).toBeTruthy()
        expect(tx.hash).toBe(Hashing.sha256(JSON.stringify(tx.content)))
        expect(await editData(tx)).toEqual({ context: "github", username: "alice", userId: "7" })
    })

    it("leaves the payload exactly as before without a userId", async () => {
        const { demos, signed } = await signingDemos()
        await identities.removeWeb2Identity(demos, { context: "twitter", username: "alice" })
        expect(payloadOf(signed[0])).toEqual({ context: "twitter", username: "alice" })
        expect(Object.keys(payloadOf(signed[0]))).toEqual(["context", "username"])

        // An empty userId names nothing and is not converted.
        const given = { context: "twitter", username: "alice", userId: "" }
        await identities.removeWeb2Identity(demos, given)
        expect(payloadOf(signed[1])).toEqual(given)
    })

    it("lets a TLSN unlink name the userId too", async () => {
        const { demos, signed } = await signingDemos()
        await identities.removeWeb2IdentityViaTLSN(demos, "github", "alice", { userId: 8, nonce: 11 })
        await identities.removeWeb2IdentityViaTLSN(demos, "github", "alice")

        expect(signed[0].content.data[1].method).toBe("tlsn_identity_remove")
        expect(payloadOf(signed[0])).toEqual({ context: "github", username: "alice", userId: "8" })
        expect(signed[0].content.nonce).toBe(11)
        expect(await editData(signed[0])).toEqual({ context: "github", username: "alice", userId: "8" })

        expect(payloadOf(signed[1])).toEqual({ context: "github", username: "alice" })
        expect(signed[1].content.nonce).toBe(4)
    })
})
