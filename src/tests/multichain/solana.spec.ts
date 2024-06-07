import { Keypair, SystemProgram, VersionedTransaction } from "@solana/web3.js"
import base58 from "bs58"

import { SOLANA } from "@/multichain/core"
import { SolanarunProgramParams as SolanaRunAnchorProgramParams } from "@/multichain/core/types/interfaces"
import { SOLANA as SC } from "@/multichain/localsdk"
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
    const localInstance = new SC(chainProviders.solana.devnet)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.solana.privateKey)
        expect(connected).toBe(true)

        const localConnected = await localInstance.connect()
        expect(localConnected).toBe(true)
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
        const programOwner = Keypair.fromSecretKey(
            Buffer.from([
                47, 72, 142, 251, 130, 2, 4, 156, 56, 97, 212, 198, 50, 46, 70,
                245, 43, 125, 240, 78, 179, 52, 28, 229, 212, 154, 144, 6, 247,
                200, 245, 211, 143, 253, 160, 61, 63, 219, 250, 162, 164, 21,
                93, 84, 108, 116, 173, 98, 47, 131, 133, 196, 173, 179, 131, 66,
                247, 152, 107, 102, 88, 244, 145, 53,
            ]),
        )
        console.log("programOwner: ", programOwner.publicKey.toBase58())
        const newAccountKeypair = new Keypair()

        // INFO: Defining the program parameters
        const programParams: SolanaRunAnchorProgramParams = {
            idl: idl,
            args: new BN(42),
            instruction: "initialize",
            accounts: {
                newAccount: newAccountKeypair.publicKey,
                signer: programOwner.publicKey,
                SystemProgram: SystemProgram.programId,
            },
            feePayer: programOwner.publicKey,
            signers: [programOwner, newAccountKeypair],
        }

        console.log("new account: ", newAccountKeypair.publicKey.toBase58())
        const tx = await instance.runAnchorProgram(
            "BLTXVno27Vc5geSn2FMxJ2yU6c3fVaUzESgDAfbYHJD6",
            programParams,
        )
        const res = await localInstance.sendTransaction(tx)

        console.log("txhash: ", res.hash)

        expect(typeof res.hash).toBe("string")

        // INFO: Wait for tx confirmation
        await instance.provider.confirmTransaction(res.hash, "finalized")

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

        console.log("data: ", acc.data.toNumber())

        expect(acc.data.toNumber()).toEqual(42)
    }, 25000)

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

    test("Running raw program", async () => {
        const key = new Keypair()

        const txhash = await instance.provider.requestAirdrop(
            key.publicKey,
            1000000000,
        )
        await instance.provider.confirmTransaction(txhash, "confirmed")

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

        const res = await localInstance.sendTransaction(tx)
        console.log("res: ", res)
    }, 25000)

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
