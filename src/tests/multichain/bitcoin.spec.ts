import { BTC } from "@/multichain/core/btc"
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

afterAll(() => {
    jest.restoreAllMocks()
})

describe.only("DEMOS Transaction with Bitcoin SDK", () => {
    const bitcoinSDK = new BTC(chainProviders.btc.testnet)

    beforeAll(async () => {
        const connected = await bitcoinSDK.connect()
        await bitcoinSDK.connectWallet(wallets.btc.privateKey)
        console.log("Connection status:", connected)
        expect(connected).toBe(true)
    })

    test("preparePays - Create multiple payment transactions", async () => {
        const payments = [{ address: addresses.btc, amount: "500" }]

        // INFO: Override the fee rate to 3 sat/byte
        const overrideFeeRate = 3
        const signedTxHexes = await bitcoinSDK.preparePays(
            payments,
            overrideFeeRate,
        )

        const xmscript = prepareXMScript({
            chain: "btc",
            subchain: "testnet",
            signedPayloads: [signedTxHexes[0]],
            type: "pay",
        })
        const identity = DemosWebAuth.getInstance()

        await identity.create()

        const tx = await prepareXMPayload(xmscript, identity.keypair)
        const rpc = "http://localhost:53550"

        const demos = new Demos()

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const validityData = await demos.confirm(tx)
        console.log("validityData", validityData)

        const res = await demos.broadcast(validityData)

        console.log(res, "< Response")

        console.log("Signed Transaction Hexes:", signedTxHexes)
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
    const instance = new BTC(chainProviders.btc.testnet)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.btc.privateKey)
        console.log("Connection status:", connected)
        expect(connected).toBe(true)
    })

    test("preparePay returns a signed transaction", async () => {
        const address = instance.getAddress()

        const signed_tx = await instance.preparePay(address, "550")
        console.log(signed_tx, "<<< signed_tx")

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
        console.log("UTXOs before:", utxosBefore)

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
        console.log("Balance:", balance)

        expect(parseInt(balance, 10)).toBeGreaterThanOrEqual(0)
    }, 300000)
})
