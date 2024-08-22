import { NEAR } from "@/multichain/core/near"

describe("NEAR CHAIN TESTS", () => {
    let instance: NEAR

    beforeAll(async () => {
        instance = await NEAR.create("https://rpc.testnet.near.org")
        await instance.connectWallet('ed25519:4QRNiJk7A584sU3aV1xhqdbdairYJybjHwo8h6F2advriyVu2JMoz319HK5dKAGJq9z78s7ntw2JVeBYybZ4r4Ec')
    })

    test("preparePays", async () => {
        const signedTxs = await instance.preparePays([
            {
                address: "test.near",
                amount: "1",
            },
        ])

        console.log(signedTxs)
    })
})
