import { demos } from "@/websdk"

describe("COMMUNICATION TESTS", () => {
    beforeAll(async () => {
        const rpc_url = "http://localhost:53550"
        await demos.connect(rpc_url)
    })

    test("getLastBlockHash", async () => {
        const txs = await demos.getAllTxs()
        console.log(txs)

        const txHash = txs[0].hash
        console.log("txHash: ", txHash)

        const tx = await demos.getTxByHash(txHash)
        console.log("tx: ", tx)

        // =================

        // const blockhash = await demos.getLastBlockHash()
        // console.log("blockhash:", blockhash)

        // const block = await demos.getBlockByHash(blockhash)
        // console.log(block)
    })
})
