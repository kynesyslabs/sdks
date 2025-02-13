import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk"
import { EnumWeb2Methods } from "@/types"

describe("Web2", () => {
    test("Simple Web2 Transaction", async () => {
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const rpc = "http://localhost:53550"
        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const proxy = await demos.web2.createDahr(demos)
        const res = await proxy.startProxy({
            method: EnumWeb2Methods.GET,
            url: "https://node2.demos.sh/info",
        })

        console.log(res)

        const res2 = await proxy.stopProxy()
        console.log(res2)
        demos.disconnect()
    })
})
