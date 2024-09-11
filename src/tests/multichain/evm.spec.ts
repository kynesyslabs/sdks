import { Transaction } from "ethers"

import { EVM } from "@/multichain/core"
import { getSampleTranfers, verifyNumberOrder } from "../utils"
import { wallets } from "../utils/wallets"
import chainProviders from "./chainProviders"

describe("EVM CHAIN TESTS", () => {
    const instance = new EVM(chainProviders.eth.sepolia)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.evm.privateKey)

        expect(connected).toBe(true)
    })

    test("preparePay returns a signed transaction", async () => {
        const address = instance.getAddress()
        const signed_tx = await instance.preparePay(address, "1")

        // INFO: Reconstruct the transaction from the signed transaction
        const tx = Transaction.from(signed_tx)

        // INFO: the r parameter is 32 bytes long
        // INFO: We assert with 66 because it's a hex string
        // (2 characters per byte + 2 for the 0x prefix)
        expect(tx.signature?.r.length).toEqual(66)
    })

    test("A tx is signed with the ledger nonce", async () => {
        const address = instance.getAddress()
        const ledgerNonce = await instance.provider.getTransactionCount(address)

        const signed_tx = await instance.preparePay(address, "1")

        // INFO: Reconstruct the transaction from the signed payload
        const tx = Transaction.from(signed_tx)

        expect(tx.nonce).toEqual(ledgerNonce)
    })

    test("Transactions are signed with increasing nonces", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => Transaction.from(tx))
        const nonces_sorted = verifyNumberOrder(txs, "nonce", {
            isNonce: true,
        })

        expect(nonces_sorted).toBe(true)
    })

    test("Transactions are signed in order of appearance", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => Transaction.from(tx))
        const values_sorted = verifyNumberOrder(txs, "value")

        expect(values_sorted).toBe(true)
    })
})
