import { demos } from "@/websdk"

describe("COMMUNICATION TESTS", () => {
    beforeAll(async () => {
        const rpc_url = "http://localhost:53550"
        await demos.connect(rpc_url)
    })

    test("getLastBlockHash", async () => {
        const block = await demos.getLastBlockHash()
        console.log(block)
    })
})