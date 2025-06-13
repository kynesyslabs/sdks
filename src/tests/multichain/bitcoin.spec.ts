import { BTC } from "@/multichain/websdk"
// import { BTC as LocalBTC } from "@/multichain/localsdk/btc"
import { Transaction } from "bitcoinjs-lib"
import { addresses, wallets } from "@/tests/utils/wallets"
import chainProviders from "./chainProviders"
import * as bitcoin from "bitcoinjs-lib"
import {
    Demos,
    DemosWebAuth,
    prepareXMPayload,
    prepareXMScript,
} from "@/websdk"

import { Hashing } from "@/encryption/Hashing"

afterAll(() => {
    jest.restoreAllMocks()
})

describe.only("DEMOS Transaction with Bitcoin SDK", () => {
    const senderSeed = "sender"
    const receiverSeed = "receiver"

    const network = bitcoin.networks.testnet
    let bitcoinSDK: BTC | null = null

    beforeAll(async () => {
        bitcoinSDK = await BTC.create(
            chainProviders.btc.testnet,
            BTC.networks.testnet,
        )

        const connected = await bitcoinSDK.connect()
        await bitcoinSDK.connectWallet(wallets.btc.privateKey)
        expect(connected).toBe(true)
    })

    test.skip("generatePrivateKey", async () => {
        const senderHash = Hashing.sha256(receiverSeed)
        const seed = Buffer.from(senderHash)

        const privateKey = bitcoinSDK.generatePrivateKey(seed)
        console.log("Receiver private key:", privateKey)
    })

    test.skip("Confirm Receiver address", async () => {
        // INFO: Helpful for running tests on the mainnet
        const receiverAddress = "bc1qm7n58dksusdawp2xtjcvlphml5jve6velpcn3k"

        const btc = new BTC(chainProviders.btc.mainnet, network)
        const connected = await btc.connect()
        expect(connected).toBe(true)

        const hash = Hashing.sha256(receiverSeed)
        const seed = Buffer.from(hash)
        const privateKey = btc.generatePrivateKey(seed)
        await btc.connectWallet(privateKey)

        console.log("Receiver address:", btc.getAddress())
        expect(btc.getAddress()).toBe(receiverAddress)
    })

    test.skip("Get Bitcoin balance", async () => {
        const balance = await bitcoinSDK.getBalance()
        console.log("Bitcoin balance:", balance)
    })

    test.only("preparePays - Create multiple payment transactions", async () => {
        const payments = [{ address: addresses.btc, amount: "500" }]

        // INFO: Override the fee rate to 3 sat/byte
        const overrideFeeRate = 3
        const signedTxHexes = await bitcoinSDK.preparePays(
            payments,
            overrideFeeRate,
        )

        // ======= SEND USING LOCAL SDK =======
        // const localBTC = new LocalBTC(chainProviders.btc.mainnet, network)
        // const res = await localBTC.sendTransaction(signedTxHexes[0])
        // console.log("Local SDK TX:", res)
        // console.log("JSON:", JSON.stringify(res, null, 2))

        // process.exit(0)
        // ======= !SEND USING LOCAL SDK =======

        const xmscript = prepareXMScript({
            chain: "btc",
            subchain: "testnet",
            signedPayloads: [signedTxHexes[0]],
            type: "pay",
        })
        const identity = DemosWebAuth.getInstance()

        await identity.create()

        const rpc = "http://localhost:53550"
        // const rpc = "https://demos.mungaist.com"

        const demos = new Demos()
        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const tx = await prepareXMPayload(xmscript, demos)

        const validityData = await demos.confirm(tx)
        const res = await demos.broadcast(validityData)
        console.log(res)

        expect(signedTxHexes).toBeDefined()
        expect(Array.isArray(signedTxHexes)).toBe(true)
        expect(signedTxHexes.length).toBe(payments.length)
        signedTxHexes.forEach(hex => {
            expect(typeof hex).toBe("string")
            expect(hex.length).toBeGreaterThan(0)
        })
    }, 300000)
})

describe.skip("BTC CHAIN TESTS", () => {
    const network = bitcoin.networks.testnet
    const instance = new BTC(chainProviders.btc.testnet, network)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.btc.privateKey)
        expect(connected).toBe(true)
    })

    test("preparePay returns a signed transaction", async () => {
        const address = instance.getAddress()
        const signed_tx = await instance.preparePay(address, "550")
        const tx = Transaction.fromHex(signed_tx)

        expect(tx).toBeInstanceOf(Transaction)
        expect(tx.ins.length).toBeGreaterThan(0)
        expect(tx.outs.length).toBeGreaterThan(0)
        const outputAddresses = tx.outs.map(out =>
            bitcoin.address.fromOutputScript(out.script, instance.network),
        )
        expect(outputAddresses).toContain(address)

        const isSigned = tx.ins.some(
            input => input.script.length > 0 || input.witness.length > 0,
        )
        expect(isSigned).toBe(true)
    }, 30000)

    test("preparePay uses available UTXOs", async () => {
        const address = instance.getAddress()
        const utxosBefore = await instance.fetchUTXOs(address)

        const signed_tx = await instance.preparePay(address, "600")
        const tx = Transaction.fromHex(signed_tx)

        // Check that at least one UTXO from fetchUTXOs is used in the transaction
        const usedUtxos = tx.ins.map(input => ({
            txid: input.hash.reverse().toString("hex"),
            vout: input.index,
        }))
        const utxoIdsBefore = utxosBefore.map(
            utxo => `${utxo.txid}:${utxo.vout}`,
        )
        const usedUtxoIds = usedUtxos.map(utxo => `${utxo.txid}:${utxo.vout}`)

        expect(utxoIdsBefore.some(id => usedUtxoIds.includes(id))).toBe(true)
    })

    test("getBalance returns the correct balance", async () => {
        const balance = await instance.getBalance()

        expect(parseInt(balance, 10)).toBeGreaterThanOrEqual(0)
    }, 300000)

    test("signMessage creates a valid signature", async () => {
        const message = "Test message for BTC"
        const signature = await instance.signMessage(message)

        expect(typeof signature).toBe("string")
        expect(signature.length).toBeGreaterThan(0)
        const signatureBuffer = Buffer.from(signature, "base64")
        expect(signatureBuffer.length).toBe(65)
    })

    test("verifyMessage validates a correct signature", async () => {
        const message = "Test message for BTC"
        const address = instance.getAddress()
        const signature = await instance.signMessage(message)

        const isValid = await instance.verifyMessage(
            message,
            signature,
            address,
        )
        expect(isValid).toBe(true)

        const isInvalid = await instance.verifyMessage(
            "Wrong message",
            signature,
            address,
        )
        expect(isInvalid).toBe(false)

        const wrongAddress = "tb1q8w4x9y7zq5v6m2n3k4j5h6g7f8d9s0a1p2l3r4"
        const isInvalidAddress = await instance.verifyMessage(
            message,
            signature,
            wrongAddress,
        )
        expect(isInvalidAddress).toBe(false)
    })

    test("verifyMessage returns false for invalid signature", async () => {
        const message = "Test message for BTC"
        const address = instance.getAddress()
        const invalidSignature = "InvalidBase64Signature=="

        const isValid = await instance.verifyMessage(
            message,
            invalidSignature,
            address,
        )
        expect(isValid).toBe(false)
    })
})
