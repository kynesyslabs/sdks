import { Demos } from "@/websdk"

describe("Native bridge Playground", () => {
    const rpc_url = "http://localhost:53550"
    const demos = new Demos()
    const mnemonic = "green comfort mother science city film option length total alone laptop donor"

    beforeAll(async () => {
        await demos.connect(rpc_url)
        await demos.connectWallet(mnemonic)
    })

    test("Validate native bridge operation", async () => {

    })
})