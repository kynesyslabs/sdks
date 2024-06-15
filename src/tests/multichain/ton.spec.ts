import { TON } from "@/multichain/core/ton"
import { wallets } from "../utils/wallets"
import { getHttpEndpoint } from "@orbs-network/ton-access"

describe("TON CHAIN TESTS", () => {
    let instance: TON

    beforeAll(async () => {
        const endpoint = await getHttpEndpoint({
            network: "testnet",
        })
        instance = await TON.create(endpoint)

        await instance.connect()
        expect(instance.connected).toBe(true)

        await instance.connectWallet(wallets.ton.privateKey)

        console.log(instance.getAddress())
    })

    // test("preparePay returns a signed tx", async () => {
    //     const res = await instance.preparePay(
    //         "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    //         "1",
    //     )

    //     const bal = await instance.getBalance(instance.getAddress())
	// 	console.log("Balance: ", bal)
    // })

    test("A tx is signed with the ledger nonce", async () => {
        // TODO: Test code here
    })

    test("Transactions are signed with increasing nonces", async () => {
        // TODO: Test code here
    })
    test("Transactions are signed in order of appearance", async () => {
        // TODO: Test code here
    })
})
