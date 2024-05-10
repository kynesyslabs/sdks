import base58 from "bs58"
import { VersionedTransaction } from "@solana/web3.js"

import { wallets } from "../utils/wallets"
import { SOLANA } from "@/multichain/core"
import chainProviders from "./chainProviders"

describe("SOLANA CHAIN TESTS", () => {
    const instance = new SOLANA(chainProviders.solana.devnet)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.solana.wallet)
        expect(connected).toBe(true)
    })

    test("preparePay returns a signed transaction", async () => {
        const tx_data = await instance.preparePay(
            "tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g",
            "0.1",
        )

        const tx = VersionedTransaction.deserialize(tx_data)
        const signature = base58.encode(tx.signatures[0])

        expect(signature.length).toBeGreaterThan(80)
    })

    // test.only('Sending Multiple tx', async () => {
    //     const address = instance.getAddress()
    //     const transfers = getSampleTranfers(address)
    //     const localInstance = await SolanaLocal.create(chainProviders.solana.devnet)
    //     await localInstance.connectWallet(wallets.solana.wallet)
    //     const signed_txs = await localInstance.preparePays(transfers)

    //     for (const tx of signed_txs) {
    //         const res = await localInstance.sendTransaction(tx)
    //         console.log("res: ", res)
    //     }

    //     expect(true)
    // })
})
