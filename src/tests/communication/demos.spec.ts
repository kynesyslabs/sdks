import { demos } from "@/websdk"

describe("DEMOS METHODS TESTS", () => {
    beforeAll(async () => {
        const rpc_url = "http://localhost:53550"
        await demos.connect(rpc_url)
    })

    test("get blocks with default parameters", async () => {
        const blocks = await demos.getBlocks()
        expect(Array.isArray(blocks)).toBe(true)

        if (blocks.length > 0) {
            expect(blocks[0]).toHaveProperty("id")
            expect(blocks[0]).toHaveProperty("number")
            expect(blocks[0]).toHaveProperty("hash")
        }
    })

    test("get last 50 blocks", async () => {
        const blocks = await demos.getBlocks("latest", 50)

        expect(Array.isArray(blocks)).toBe(true)
        expect(blocks?.length).toBeLessThanOrEqual(50)

        if (blocks.length > 0) {
            expect(blocks[0]).toHaveProperty("id")
            expect(blocks[0]).toHaveProperty("number")
            expect(blocks[0]).toHaveProperty("hash")
        }
    })

    test("get last block", async () => {
        const blocks = await demos.getBlocks("latest", 1)

        expect(Array.isArray(blocks)).toBe(true)
        expect(blocks?.length).toBe(1)

        if (blocks.length > 0) {
            expect(blocks[0]).toHaveProperty("id")
            expect(blocks[0]).toHaveProperty("number")
            expect(blocks[0]).toHaveProperty("hash")
        }
    })

    test("get previous block", async () => {
        const lastBlockNumber = await demos.getLastBlockNumber()
        const firstBlock = await demos.getBlocks(lastBlockNumber, 1)

        expect(Array.isArray(firstBlock)).toBe(true)
        expect(firstBlock?.length).toBe(1)

        if (firstBlock.length > 0) {
            expect(firstBlock[0]).toHaveProperty("id", 1)
            expect(firstBlock[0]).toHaveProperty("number", 0)
        }
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
        console.log(transactions)

        expect(Array.isArray(transactions)).toBe(true)
        expect(transactions?.length).toBe(1)

        if (transactions.length > 0) {
            expect(transactions[0]).toHaveProperty("id")
            expect(transactions[0]).toHaveProperty("blockNumber")
            expect(transactions[0]).toHaveProperty("signature")
        }
    })

    test.only("Get address Info", async () => {
        const addressInfo = await demos.getAddressInfo(
            "ccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        console.log(addressInfo)

        expect(addressInfo).not.toBeNull()
    })

    test("Get address nonce", async () => {
        const addressNonce = await demos.getAddressNonce(
            "ccc6ba0c609435a05fdbf236e7df7d60f024ed26c19d8f64b024e6163036247a",
        )
        expect(addressNonce).not.toBeNull()
    })
})
