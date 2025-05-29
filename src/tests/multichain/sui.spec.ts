import { SUI } from "@/multichain/websdk/sui"
import chainProviders from "@/tests/multichain/chainProviders"
import { wallets } from "@/tests/utils/wallets"
import {
    Demos,
    DemosWebAuth,
    prepareXMPayload,
    prepareXMScript,
} from "@/websdk"

describe("SUI CHAIN TESTS", () => {
    let sui: SUI
    let testAddress: string

    beforeAll(async () => {
        sui = new SUI(chainProviders.sui.testnet)
        const connected = await sui.connect()
        expect(connected).toBe(true)

        testAddress =
            "0x18ed053d809847b3ce9b4a81f3c2467134bb0f0a16869fa38cd57225076899ca"
        await sui.connectWallet(wallets.sui.privateKey)
    })

    test("createWallet generates a new wallet", async () => {
        const wallet = await sui.createWallet()

        expect(wallet).toHaveProperty("address")
        expect(wallet).toHaveProperty("publicKey")
        expect(wallet).toHaveProperty("keypair")

        expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{64}$/)
    })

    test("connectWallet sets the wallet correctly", async () => {
        const address =
            "0x152a2cb775e76dc840d654e9e8ca132c7580d647bcd06316af9e6cae0b017f75"
        await sui.connectWallet(wallets.sui.privateKey)
        expect(sui.getAddress()).toBe(address)
    })

    test("getBalance returns the balance as a string", async () => {
        const connectedAddress = sui.getAddress()
        const balance = await sui.getBalance(connectedAddress)

        expect(typeof balance).toBe("string")
        expect(parseInt(balance, 10) >= 0).toBe(true)
    })

    test("signMessage and verifyMessage work correctly", async () => {
        const message = "Test message"
        const signature = await sui.signMessage(message)
        expect(typeof signature).toBe("string")

        const publicKey = sui.wallet.getPublicKey().toBase64()
        const isValid = await sui.verifyMessage(message, signature, publicKey)
        expect(isValid).toBe(true)

        const isInvalid = await sui.verifyMessage(
            "Wrong message",
            signature,
            publicKey,
        )
        expect(isInvalid).toBe(false)
    })

    test("preparePay creates a signed transaction", async () => {
        const address = testAddress
        const amount = "1000"
        const result = await sui.preparePay(address, amount)
        expect(result).toHaveProperty("bytes")
        expect(result).toHaveProperty("signature")
        expect(typeof result.bytes).toBe("string")
        expect(typeof result.signature).toBe("string")
    })

    test("preparePays creates multiple signed transactions", async () => {
        const anotherWallet = await sui.createWallet()
        const payments = [
            { address: testAddress, amount: "1000" },
            { address: anotherWallet.address, amount: "2000" },
        ]
        const results = await sui.preparePays(payments)
        expect(results.length).toBe(2)
        results.forEach(result => {
            expect(result).toHaveProperty("bytes")
            expect(result).toHaveProperty("signature")
            expect(typeof result.bytes).toBe("string")
            expect(typeof result.signature).toBe("string")
        })
    })
})

describe.skip("DEMOS Transaction with Sui SDK", () => {
    const senderMnemonic = wallets.sui.privateKey
    let receiverAddress: string
    let suiSDK: SUI | null = null
    let operationId: string

    beforeAll(async () => {
        suiSDK = new SUI(chainProviders.sui.testnet)
        const connected = await suiSDK.connect()
        expect(connected).toBe(true)

        await suiSDK.connectWallet(senderMnemonic)

        receiverAddress =
            "0x18ed053d809847b3ce9b4a81f3c2467134bb0f0a16869fa38cd57225076899ca"

        const balance = await suiSDK.getBalance(suiSDK.getAddress())
        expect(parseInt(balance, 10)).toBeGreaterThan(0)
    })

    it("preparePays - Create multiple payment transactions", async () => {
        const payments = [{ address: receiverAddress, amount: "1000" }]

        const signedTxs = await suiSDK.preparePays(payments)

        expect(signedTxs).toBeDefined()
        expect(Array.isArray(signedTxs)).toBe(true)
        expect(signedTxs.length).toBe(payments.length)
        signedTxs.forEach(tx => {
            expect(tx).toHaveProperty("bytes")
            expect(tx).toHaveProperty("signature")
            expect(typeof tx.bytes).toBe("string")
            expect(typeof tx.signature).toBe("string")
            expect(
                Buffer.from(tx.signature, "base64").length,
            ).toBeGreaterThanOrEqual(65)
        })

        const xmscript = prepareXMScript({
            chain: "sui",
            subchain: "testnet",
            signedPayloads: [signedTxs[0]],
            type: "pay",
        })

        operationId = Object.keys(xmscript.operations)[0]
        const identity = DemosWebAuth.getInstance()
        await identity.create()

        const tx = await prepareXMPayload(xmscript, identity.keypair)

        const rpc = "http://localhost:53550"
        const demos = new Demos()

        await demos.connect(rpc)
        await demos.connectWallet(identity.keypair.privateKey as any)

        const validityData = await demos.confirm(tx)

        const res = await demos.broadcast(validityData)

        expect(res).toBeDefined()
        expect(res.result).toBe(200)
        expect(res.response[operationId].result).toBe("success")
        expect(res.response[operationId].hash).toBeDefined()
    }, 300000)
})
