import { getHttpEndpoint } from "@orbs-network/ton-access"

import { TON } from "@/multichain/core/ton"
import { TON as Local } from "@/multichain/localsdk/ton"
import { wallets } from "../utils/wallets"

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
    })

    test.skip("preparePay returns a signed tx", async () => {
        return "ok"
    })

    test.skip("A tx is signed with the ledger nonce", async () => {
        // // TODO: Test code here
        // const tx = await instance.preparePay(
        //     "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
        //     "1.01",
        // )
        // // extract nonce from tx
        // const cell = Cell.fromBoc(tx)[0]
        // // INFO: Figure out how to extract the nonce from a Cell
        // const nonce = loadMessage(cell.beginParse())
        // console.log(nonce)
    })

    test.skip("Transactions are signed with increasing nonces", async () => {
        // TODO: Test code here
    })

    test.skip("Transactions are signed in order of appearance", async () => {
        // TODO: Test code here
    })

    test("Sending a tx", async () => {
        // NOTE: Tx sending is working, skip this test!
        const tx = await instance.preparePay(
            "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
            "1.01",
        )

        const localInstance = await Local.create(instance.rpc_url)
        const res = await localInstance.sendTransaction(tx)
        console.log(res)
    })
})
