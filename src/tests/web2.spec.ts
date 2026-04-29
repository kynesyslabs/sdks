import { Demos } from "@/websdk"
import { DemosWebAuth } from "@/websdk"

describe("Web2", () => {
    const mnemonic = process.env.FUNDED_MNEMONIC

    if (!mnemonic) {
        console.error("FUNDED_MNEMONIC is not set")
        process.exit(0)
    }

    test("Full Web2 Transaction", async () => {
        // 1. Initialize the demos instance
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        // const rpc = "https://node3.demos.sh"
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
