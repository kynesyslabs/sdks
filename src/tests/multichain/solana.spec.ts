import base58 from "bs58"
import { Keypair, VersionedTransaction } from "@solana/web3.js"

import { wallets } from "../utils/wallets"
import { SOLANA } from "@/multichain/core"
import { getSampleTranfers } from "../utils"
import chainProviders from "./chainProviders"
import { SOLANA as SolanaLocal } from "@/multichain/localsdk"

describe("SOLANA CHAIN TESTS", () => {
    const instance = new SOLANA(chainProviders.solana.devnet)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.solana.wallet, { base58: true })
        expect(connected).toBe(true)
    })

    test("Reads the balance of an address", async () => {
        const balance = await instance.getBalance(instance.getAddress())
        console.log("Balance:", balance)
        expect(true)
    })

    test("preparePay returns a signed transaction", async () => {
        // const keypair = Keypair.generate()
        // console.log(base58.encode(keypair.secretKey))

        // const nonceAcc = await instance.createNonceAccount()
        // console.log("nonceAcc: ", nonceAcc)
        // Nonce acc address: amzR7nwNhLSEuQygN9xSbrfpXniQAuCJJweCWxiryvg

        // const tx = await instance.preparePay('tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g', '0.1', {
        //     nonceAccountAddress: 'amzR7nwNhLSEuQygN9xSbrfpXniQAuCJJweCWxiryvg',
        //     nonceAccountAuthority: base58.encode(keypair.secretKey)
        // })
        const tx_data = await instance.preparePay(
            "tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g",
            "0.1",
        )

        const tx = VersionedTransaction.deserialize(tx_data)
        const signature = base58.encode(tx.signatures[0])
        console.log("tx.signature: ", signature)

        expect(signature.length).toBeGreaterThan(80)
    })

    test.only('Sending Multiple tx', async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const localInstance = await SolanaLocal.create(chainProviders.solana.devnet)
        await localInstance.connectWallet(wallets.solana.wallet, { base58: true })
        const signed_txs = await localInstance.preparePays(transfers)

        for (const tx of signed_txs) {
            const res = await localInstance.sendTransaction(tx)
            console.log("res: ", res)
        }

        expect(true)
    })

    test("Send tx", async () => {
        const keypair = Keypair.generate()
        console.log(keypair.publicKey.toBase58())
        console.log(base58.encode(keypair.secretKey))
        // const tx = await instance.preparePay(
        //     "tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g",
        //     "0.1",
        // )
        // await instance.sendTransaction(tx)
        // expect(true)
    })
})
