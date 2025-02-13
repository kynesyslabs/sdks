import { demos } from "@/websdk"
import * as forge from "node-forge"

import { DemosWebAuth } from "@/websdk"
import * as bip39 from "@scure/bip39"
import { Cryptography } from "@/encryption/Cryptography"

describe("COMMUNICATION TESTS", () => {
    beforeAll(async () => {
        const rpc_url = "http://localhost:53550"
        await demos.connect(rpc_url)
    })

    test.skip("getLastBlockHash", async () => {
        // const txs = await demos.getAllTxs()
        // console.log(txs)

        // const txHash = txs[0].hash
        // console.log("txHash: ", txHash)

        // const tx = await demos.getTxByHash(txHash)
        // console.log("tx: ", tx)

        // =================

        const blockhash = await demos.getLastBlockHash()

        expect(typeof blockhash).toBe("string")
        console.log("blockhash:", blockhash)

        const block = await demos.getBlockByHash(blockhash)
        console.log("block:", block)
    })

    test.skip("getAddressInfo", async () => {
        const res = await demos.getAddressInfo("X-USER-1")
        console.log("res:", res)
    })

    test.skip("getBlockByNumber", async () => {
        const latestBlock = await demos.getLastBlockNumber()
        console.log("latestBlock:", latestBlock)

        const block = await demos.getBlockByNumber(latestBlock)
        console.log("type of block", typeof block)
        console.log("block:", block)
    })

    test.skip("Mnemonic to seed", async () => {
        const mnemonic =
            "property gym walk decorate laundry grab cabin outer artist nest castle vote"
        // const seed = await bip39.mnemonicToSeed(mnemonic)
        const keypair = forge.pki.ed25519.generateKeyPair({ seed: mnemonic })

        for (let i = 0; i < 10; i++) {
            expect(keypair.publicKey.toString("hex")).toBe(
                "7214cf0d8fdbac210bbdba8ba1cc590cf5028aa177ea506b16e9daf5347605b6",
            )

            expect(keypair.privateKey.toString("hex")).toBe(
                "f90782506df22b706aff6673feb0f220b5cfb221e04b84677e2f306ad2684bdd7214cf0d8fdbac210bbdba8ba1cc590cf5028aa177ea506b16e9daf5347605b6",
            )
        }
    })

    test.only("demos.connectWallet", async () => {
        const mnemonic =
            "property gym walk decorate laundry grab cabin outer artist nest castle vote"

        const publicKey = await demos.connectWallet(mnemonic, {
            isSeed: true,
        })
        expect(publicKey).toBe('8cdc77be55fa6d91df62cf21079597cdc3fc8125443989ef2d4beae8b8501c4b')
    })

    test.skip("demos.connectWallet", async () => {
        const mnemonic =
            "property gym walk decorate laundry grab cabin outer artist nest castle vote"

        const keypair = Cryptography.newFromSeed(mnemonic)

        console.log("privateKey:", keypair.privateKey.toString("hex"))
        console.log("publicKey:", keypair.publicKey.toString("hex"))
    })
})
