import { Keypair, SystemProgram, VersionedTransaction } from "@solana/web3.js"
import base58 from "bs58"

import { SOLANA } from "@/multichain/core"
import { SOLANA as SC } from "@/multichain/localsdk"
import { SolanarunProgramParams as SolanaRunAnchorProgramParams } from "@/multichain/core/types/interfaces"
import { BN } from "@project-serum/anchor"
import { wallets } from "../utils/wallets"
import chainProviders from "./chainProviders"

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

    test("Running anchor program", async () => {
        const pk = instance.wallet.publicKey
        const newAccountKeypair = new Keypair()

        // INFO: Defining the program parameters
        const programParams: SolanaRunAnchorProgramParams = {
            idl: idl,
            args: new BN(42),
            instruction: "initialize",
            accounts: {
                newAccount: newAccountKeypair.publicKey,
                signer: pk,
                SystemProgram: SystemProgram.programId,
            },
            signers: [newAccountKeypair, instance.wallet],
        }

        console.log("new account: ", newAccountKeypair.publicKey.toBase58())
        const txhash = await instance.runAnchorProgram(
            "BLTXVno27Vc5geSn2FMxJ2yU6c3fVaUzESgDAfbYHJD6",
            programParams,
        )

        console.log("txhash: ", txhash)
        expect(typeof txhash).toBe("string")

        // INFO: Confirming the transaction
        await instance.provider.confirmTransaction(txhash, "finalized")

        // INFO: Reading the account data
        const acc = await instance.fetchAccount(
            newAccountKeypair.publicKey.toBase58(),
            {
                idl: idl,
                name: "newAccount",
                // INFO: if programId is not provided, account owner will be fetched from the network
                // programId: "BLTXVno27Vc5geSn2FMxJ2yU6c3fVaUzESgDAfbYHJD6",
            },
        )

        expect(acc.data.toNumber()).toEqual(42)
    })

    test("Reading program owned account data", async () => {
        const acc = await instance.fetchAccount(
            // address of an account created by the program
            "5dDANLFBcmFyFQonFcJsE9i3YqK74JPAMAiL1WXmWKSL",
            {
                idl: idl,
                name: "newAccount",
            },
        )
        console.log("data: ", acc.data.toNumber())
        expect(acc.data.toNumber()).toEqual(42)
    })

    test.only("Running raw program", async () => {
        const key = new Keypair()

        const txhash = await instance.provider.requestAirdrop(
            key.publicKey,
            1000000000,
        )
        await instance.provider.confirmTransaction(txhash, "finalized")

        const keys = [
            {
                pubkey: key.publicKey,
                isSigner: true,
                isWritable: true,
            },
        ]

        const params = {
            space: 100,
        }

        const feePayer = key.publicKey
        const instructionIndex = 8
        const instructionName = "space"

        const tx = await instance.runRawProgram(SystemProgram.programId, {
            instructionIndex,
            instructionName,
            keys,
            params,
            feePayer,
            signers: [key],
        })

        console.log("tx: ", tx)

        const localInstance = await SC.create(chainProviders.solana.devnet)
        await localInstance.connectWallet(wallets.solana.wallet)

        const res = await localInstance.sendTransaction(tx)
        console.log("res: ", res)
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
