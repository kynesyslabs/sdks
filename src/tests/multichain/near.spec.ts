import { NEAR } from "@/multichain/core/near"
import { NEAR as LocalNEAR } from "@/multichain/localsdk/near"

describe("NEAR CHAIN TESTS", () => {
    let instance: NEAR
    let localInstance: LocalNEAR

    beforeAll(async () => {
        instance = await NEAR.create("https://rpc.testnet.near.org", "testnet")
        localInstance = await LocalNEAR.create(
            "https://rpc.testnet.near.org",
            "testnet",
        )

        await instance.connectWallet(
            "ed25519:4QRNiJk7A584sU3aV1xhqdbdairYJybjHwo8h6F2advriyVu2JMoz319HK5dKAGJq9z78s7ntw2JVeBYybZ4r4Ec",
            {
                accountId: "cwilvx.testnet",
            },
        )
    })

    test.skip("getBalance", async () => {
        const balance = await instance.getBalance("cwilvx.testnet")
        console.log(balance)
    })

    test.skip("preparePays", async () => {
        const signedTxs = await instance.preparePays([
            {
                address: "cwilvx.testnet",
                amount: "1.5",
            },
        ])

        console.log(signedTxs)

        const res = await localInstance.sendTransaction(signedTxs[0])
        console.log(res)
    })

    test.only("createAccount", async () => {
        const { privateKey, signedTx } = await instance.createAccount(
            "other2.cwilvx.testnet",
            "1",
        )
        console.log(signedTx, privateKey)
        const res2 = await localInstance.sendTransaction(signedTx)
        console.log(res2)
    })
})
