import { Identities } from "@/abstraction"
import { Demos } from "@/websdk"

describe("First Transaction Reward System", () => {
    const RPC = "http://localhost:53550"

    let demos: Demos = new Demos()
    const identities = new Identities()

    beforeAll(async () => {
        await demos.connect(RPC)

        const mnemonic =
            "mixed level agree vendor fun duck capital auction crowd tank hidden tragic"

        await demos.connectWallet(mnemonic)
    })

    test.only("Send transaction to new recipient and verify first transaction rewards", async () => {
        const recipientAddress =
            "0x7dc49173e6324221bfe16ff3e003c68061732f64619adaeec9bec2b8a19d3409"
        const senderAddress = demos.getAddress()

        console.log("Sending transaction from", senderAddress)
        console.log("Sending transaction to", recipientAddress)

        const tx = await demos.pay(recipientAddress, 10)
        console.log("Created transaction", tx)

        const confirmRes = await demos.confirm(tx)
        console.log("Transaction confirmation result", confirmRes)

        expect(confirmRes.result).toBe(200)

        const broadcastRes = await demos.broadcast(confirmRes)
        console.log("Transaction broadcast result", broadcastRes)

        expect(broadcastRes.result).toBe(200)

        const recipientPointsResponse = await identities.getUserPoints(
            demos,
            recipientAddress,
        )

        console.log("recipientPointsResponse", recipientPointsResponse)

        expect(recipientPointsResponse.result).toBe(200)

        const recipientPointsResult = recipientPointsResponse.response as any
        console.log("recipientPointsResult", recipientPointsResult)

        expect(recipientPointsResult.result).toBe(200)

        const responseData = recipientPointsResult.response
        console.log("responseData", responseData)

        expect(responseData.breakdown.firstWalletTransaction).toBe(2)
    })
})
