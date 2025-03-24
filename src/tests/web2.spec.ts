import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk"
import { EnumWeb2Methods } from "@/types"

describe("Web2", () => {
    test("Full Web2 Transaction", async () => {
        // 1. Initialize the demos instance
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const rpc = "https://demosnode.discus.sh"
        const demos = new Demos()
        await demos.connect(rpc)

        await demos.connectWallet(identity.keypair.privateKey as Uint8Array)

        // 2. Create a proxy
        const proxy = await demos.web2.createDahr()

        // 3. Start the proxy and send a request
        const res = await proxy.startProxy({
            method: EnumWeb2Methods.GET,
            url: "https://demosnode.discus.sh/info",
        })

        console.log(res)

        // 4. Cleanup
        const res2 = await proxy.stopProxy()
        console.log(res2)
        demos.disconnect()
    })
})
