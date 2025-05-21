import { Identities } from "@/abstraction"
import { Demos, DemosWebAuth } from "@/websdk"

describe("IDENTITIES PQC", () => {
    let rpc = "http://localhost:53550"
    let demos: Demos
    const identities = new Identities()

    beforeAll(async () => {
        const identity = new DemosWebAuth()
        await identity.login("2befb9016e8a39a6177fe8af8624c763da1a6f51b0e7c6ebc58d62749c5c68d55a6f62c7335deb2672a6217c7594c7af9f0fae0e84358673ba268f6901287928")
        demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey, {
            algorithm: "ed25519"
        })
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
