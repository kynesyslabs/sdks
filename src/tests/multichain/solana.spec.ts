import base58 from "bs58"
import { VersionedTransaction, Keypair, SystemProgram } from "@solana/web3.js"

import { SOLANA } from "@/multichain/core"
import { programParams } from "@/multichain/core/solana"
import { wallets } from "../utils/wallets"
import chainProviders from "./chainProviders"
import { BN } from "@project-serum/anchor"

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

    test.only("Running a program", async () => {
        const pk = instance.wallet.publicKey.toBase58()
        const newAccountKeypair = new Keypair()
        const idl = {
            version: "0.1.0",
            name: "hello_anchor",
            instructions: [
                {
                    name: "initialize",
                    accounts: [
                        {
                            name: "newAccount",
                            isMut: true,
                            isSigner: true,
                        },
                        {
                            name: "signer",
                            isMut: true,
                            isSigner: true,
                        },
                        {
                            name: "systemProgram",
                            isMut: false,
                            isSigner: false,
                        },
                    ],
                    args: [
                        {
                            name: "data",
                            type: "u64",
                        },
                    ],
                },
            ],
            accounts: [
                {
                    name: "NewAccount",
                    type: {
                        kind: "struct",
                        fields: [
                            {
                                name: "data",
                                type: "u64",
                            },
                        ],
                    },
                },
            ],
        }
        const programParams: programParams = {
            idl: idl,
            args: new BN(42),
            instruction: "initialize",
            accounts: {
                newAccount: newAccountKeypair.publicKey.toBase58(),
                signer: pk,
                SystemProgram: SystemProgram.programId.toBase58(),
            },
            signers: [newAccountKeypair, instance.wallet],
            returnAccounts: [
                {
                    newAccount: newAccountKeypair.publicKey.toBase58(),
                },
            ],
        }

        console.log("new account: ", newAccountKeypair.publicKey.toBase58())
        const pg = await instance.runProgram(
            "BLTXVno27Vc5geSn2FMxJ2yU6c3fVaUzESgDAfbYHJD6",
            programParams,
        )
        console.log("txhash: ", pg)
        expect(pg).toBe(typeof "string")
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
