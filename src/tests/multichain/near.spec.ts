import { NEAR } from "@/multichain/core/near"
import { NEAR as LocalNEAR } from "@/multichain/localsdk/near"
import {
    decodeSignedTransaction,
    decodeTransaction,
} from "@near-js/transactions"
import bigInt from "big-integer"
import { getSampleTranfers, verifyNumberOrder } from "../utils"

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

    test("preparePay returns a signed tx", async () => {
        const address = instance.getAddress()
        const signedTx = await instance.preparePay(address, "1.5")

        const decodedSignedTx = decodeSignedTransaction(signedTx)
        expect(decodedSignedTx.signature.ed25519Signature.data.length).toBe(64)
    })

    test("A tx is signed with the ledger nonce", async () => {
        // Read the ledger nonce
        const address = instance.getAddress()
        const account = await instance.provider.account(instance.accountId)
        // INFO: Get the access keys
        const info = await account.getAccessKeys()
        // INFO: Find the access key for this address
        const ledgeNonce = info.find(key => key.public_key === address)
            ?.access_key.nonce

        const signedTx = await instance.preparePay(address, "1.5")
        const decodedTx = decodeTransaction(signedTx)

        // INFO: The nonce is 1 more than the ledger nonce
        expect(bigInt(decodedTx.nonce).toString()).toBe(
            bigInt(ledgeNonce).add(1).toString(),
        )
    })

    test("Transactions are signed with increasing nonces", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => decodeTransaction(tx))
        const nonces_sorted = verifyNumberOrder(txs, "nonce", {
            isNonce: true,
        })

        expect(nonces_sorted).toBe(true)
    })

    test("Transactions are signed in order of appearance", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => decodeTransaction(tx))
        const amounts = txs.map(tx => {
            return {
                amount: tx.actions[0].transfer.deposit,
            }
        })
        const values_sorted = verifyNumberOrder(amounts, "amount")

        expect(values_sorted).toBe(true)
    })

    // SECTION: Local tests

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

    test.skip("createAccount", async () => {
        const { keyPair, signedTx } = await instance.createAccount(
            "other2.cwilvx.testnet",
            "1",
        )
        console.log(signedTx, keyPair)
        const res2 = await localInstance.sendTransaction(signedTx)
        console.log(res2)
    })

    test.skip("hacking", async () => {
        const tx = instance.actions.createAccount()
        console.log(tx)
    })
})
