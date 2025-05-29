import { Demos, DemosWebAuth } from "@/websdk"

describe("New Demos", () => {
    test.only("Send Native tokens", async () => {
        const rpc = "http://localhost:53550"

        const identity = DemosWebAuth.getInstance()
        await identity.login(
            "0x8ef606ad922ae1ce88fa8b245b8dbcff5b5a5ca1b21c594be0c505af6f5317471060ab12b16a7385351fd6ebf0029cc9bcf4dcb2bdb49093368ce4b511f4f1ad",
        )

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as Uint8Array, {
            algorithm: "falcon",
            dual_sign: true
        })

        const tx = await demos.pay(
            identity.keypair.publicKey.toString("hex"),
            100,
        )

        const validityData = await demos.confirm(tx)
        expect(validityData.result).toBe(200)

        const result = await demos.broadcast(validityData)
        expect(result.result).toBe(200)
    })
})
