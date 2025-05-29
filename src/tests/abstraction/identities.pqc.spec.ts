import { Identities } from "@/abstraction"
import { Demos, DemosWebAuth } from "@/websdk"

describe("IDENTITIES PQC", () => {
    let rpc = "http://localhost:53550"
    let demos: Demos
    const identities = new Identities()

    beforeAll(async () => {
        const identity = new DemosWebAuth()
        await identity.login("0x8ef606ad922ae1ce88fa8b245b8dbcff5b5a5ca1b21c594be0c505af6f5317471060ab12b16a7385351fd6ebf0029cc9bcf4dcb2bdb49093368ce4b511f4f1ad")
        demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey)
    })

    test.only("Adding PQC identities", async () => {
        const validityData = await identities.bindPqcIdentity(demos, "all")
        expect(validityData.result).toBe(200)

        const res = await demos.broadcast(validityData)
        console.log(res)

        expect(res.result).toBe(200)
    })

    test.skip("Removing PQC identities", async () => {
        const validityData = await identities.removePqcIdentity(demos, "all")
        expect(validityData.result).toBe(200)

        const res = await demos.broadcast(validityData)
        console.log(res)

        expect(res.result).toBe(200)
    })
})
