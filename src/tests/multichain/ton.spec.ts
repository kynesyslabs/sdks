import { TON } from "@/multichain/core/ton"
import { TON as Local } from "@/multichain/localsdk/ton"

import { wallets } from "../utils/wallets"
import { getHttpEndpoint } from "@orbs-network/ton-access"
import { Cell, beginCell, external, storeMessage } from "@ton/core"

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

    test.skip("preparePay returns a signed tx", async () => {
        return "ok"
    })

    test("A tx is signed with the ledger nonce", async () => {
        // TODO: Test code here
    })

    test("Transactions are signed with increasing nonces", async () => {
        // TODO: Test code here
    })
    test("Transactions are signed in order of appearance", async () => {
        // TODO: Test code here
    })

    test("Sending a tx", async () => {
        const tx = await instance.preparePay(
            "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
            "1.01",
        )

        const localInstance = await Local.create(instance.rpc_url)
        const res = await localInstance.sendTransaction(tx)
        console.log(res)
    })
})
