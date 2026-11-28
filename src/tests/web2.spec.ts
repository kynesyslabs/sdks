import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk"
import { requireFundedMnemonic } from "./utils/requireFundedMnemonic"

describe("Web2", () => {
    const mnemonic = requireFundedMnemonic(process.env)

    test("Full Web2 Transaction", async () => {
        // 1. Initialize the demos instance
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        // const rpc = "https://demosnode.discus.sh"
        // const rpc = "https://node2.demos.sh"
        const rpc = "http://localhost:53550"
        const demos = new Demos()
        await demos.connect(rpc)

        await demos.connectWallet(mnemonic)

        for (let i = 0; i < 1; i++) {
            // 2. Create a proxy
            const proxy = await demos.web2.createDahr()

            // 3. Start the proxy and send a request
            const res = await proxy.startProxy({
                method: "GET",
                url: "https://google.com",
            })

            console.log("Response:", res)

            // 4. Disconnect from the demos instance
            demos.disconnect()
        }
    })
})
