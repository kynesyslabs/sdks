import base58 from "bs58"
import { VersionedTransaction, Keypair } from "@solana/web3.js"

import { SOLANA } from "@/multichain/core"
import { programParams } from "@/multichain/core/solana"
import { wallets } from "../utils/wallets"
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

    test.only("fetching Program IDL", async () => {
        const idl = await instance.getProgramIdl('MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD')
        console.log("idl: ", idl.instructions[0])
        
        const pk = instance.wallet.publicKey.toBase58()
        Keypair.generate()
        const programParams: programParams = {
            // args: {
            //     score: 100,
            // },
            instruction: "close",
            accounts: {
                state: pk,
                receiver: pk,
                tokenVault: pk,
                vaultAuthority: pk,
                duplicationFlag: pk,
            },
            signers: [instance.wallet],
            returnAccounts: [
                {
                    state: pk,
                },
            ],
        }
        const pg = await instance.runProgram(
            "cjg3oHmg9uuPsP8D6g29NWvhySJkdYdAo9D25PRbKXJ",
            programParams,
        )
        console.log("pg: ", pg)

        const newInstance = await SOLANA.create(chainProviders.solana.devnet)
        console.log(newInstance.provider)

        expect(pg).toBeDefined()
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
