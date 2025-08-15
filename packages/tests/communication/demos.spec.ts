import { demos } from "@/websdk"

describe("DEMOS METHODS TESTS", () => {
    beforeAll(async () => {
        const rpc_url = "http://localhost:53550"
        await demos.connect(rpc_url)
    })

    test("get transactions with default parameters", async () => {
        const transactions = await demos.getTransactions()
        expect(Array.isArray(transactions)).toBe(true)

        if (transactions.length > 0) {
            expect(transactions[0]).toHaveProperty("id")
            expect(transactions[0]).toHaveProperty("blockNumber")
            expect(transactions[0]).toHaveProperty("signature")
        }
    })

    test("get last transaction", async () => {
        const transactions = await demos.getTransactions("latest", 1)

        expect(Array.isArray(transactions)).toBe(true)
        expect(transactions?.length).toBe(1)

        if (transactions.length > 0) {
            expect(transactions[0]).toHaveProperty("id")
            expect(transactions[0]).toHaveProperty("blockNumber")
            expect(transactions[0]).toHaveProperty("signature")
        }
    })

    test("Get address Info", async () => {
        const addressInfo = await demos.getAddressInfo(
            "ccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        console.log(addressInfo)

        expect(addressInfo?.pubkey).toBe(
            "ccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
    })

    test("Get address nonce", async () => {
        const addressNonce = await demos.getAddressNonce(
            "ccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        console.log(addressNonce)
        expect(addressNonce).not.toBeNull()
    })

    test("Get Blocks", async () => {
        // Get the last 25 blocks
        const blocks = await demos.getBlocks("latest", 25)
        expect(Array.isArray(blocks)).toBe(true)
        expect(blocks.length).toBe(25)

        // Get from block 50 to 25
        const nextBlocks = await demos.getBlocks(50, 25)

        expect(nextBlocks.length).toBe(25)
        expect(nextBlocks[0].number).toBe(50)
        expect(nextBlocks[nextBlocks.length - 1].number).toBe(26)

        // Get Blocks with invalid start block number
        const invalidBlocks = await demos.getBlocks("something" as any, 25)
        expect(Array.isArray(invalidBlocks)).toBe(true)
        expect(invalidBlocks.length).toBe(0)

        // Get Blocks with invalid block limit
        const invalidBlocksLimit = await demos.getBlocks(0, "something" as any)
        expect(Array.isArray(invalidBlocksLimit)).toBe(true)
        expect(invalidBlocksLimit.length).toBe(0)
    })

    test("Get Transactions", async () => {
        // Get 25 transactions from latest
        const transactions = await demos.getTransactions("latest", 25)
        expect(Array.isArray(transactions)).toBe(true)
        expect(transactions.length).toBe(25)

        // Get 25 transactions from block 100
        const tx2 = await demos.getTransactions(100, 25)
        expect(Array.isArray(tx2)).toBe(true)
        expect(tx2.length).toBe(25)
        expect(tx2[0].id).toBe(100)
        expect(tx2[tx2.length - 1].id).toBe(76)

        // Get transactions with invalid block number
        const invalidTx = await demos.getTransactions("something" as any, 25)
        expect(Array.isArray(invalidTx)).toBe(true)
        expect(invalidTx.length).toBe(0)

        // Get transactions with invalid block limit
        const invalidTxLimit = await demos.getTransactions(100, "something" as any)
        expect(Array.isArray(invalidTxLimit)).toBe(true)
        expect(invalidTxLimit.length).toBe(0)
    })
})
