import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk"
import { EnumWeb2Methods } from "@/types"

describe("Web2", () => {
    test("Full Web2 Transaction", async () => {
        // 1. Initialize the demos instance
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        // const rpc = "https://demosnode.discus.sh"
        const rpc = "http://localhost:53550"
        // const rpc = "https://demos.mungaist.com"
        const demos = new Demos()
        await demos.connect(rpc)

        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        for (let i = 0; i < 100; i++) {
            // 2. Create a proxy
            const proxy = await demos.web2.createDahr()

            // 3. Start the proxy and send a request
            const res = await proxy.startProxy({
                method: EnumWeb2Methods.GET,
                url: "https://google.com",
            })

            console.log(res)
            // 4. Cleanup
            const res2 = await proxy.stopProxy()
            console.log(res2)
        }

        demos.disconnect()
    })
})
