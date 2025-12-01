import { Transaction, parseEther } from "ethers"

import { EVM } from "@/multichain/localsdk"
import { getSampleTranfers, verifyNumberOrder } from "../utils"
import { wallets } from "../utils/wallets"
import chainProviders from "./chainProviders"
import { Demos, prepareXMPayload, prepareXMScript } from "@/websdk"

describe("EVM CHAIN TESTS", () => {
    const rpc = "http://localhost:53550"
    const demos = new Demos()
    const instance = new EVM(chainProviders.eth.mainnet)

    beforeAll(async () => {
        const connected = await instance.connect()
        await instance.connectWallet(wallets.evm.privateKey)

        expect(connected).toBe(true)

        await demos.connect(rpc)
        await demos.connectWallet(
            "polar scale globe beauty stock employ rail exercise goat into sample embark",
        )
    })

    test("preparePay returns a signed transaction", async () => {
        const address = instance.getAddress()
        const signed_tx = await instance.preparePay(address, "1")

        // INFO: Reconstruct the transaction from the signed transaction
        const tx = Transaction.from(signed_tx)

        // INFO: the r parameter is 32 bytes long
        // INFO: We assert with 66 because it's a hex string
        // (2 characters per byte + 2 for the 0x prefix)
        expect(tx.signature?.r.length).toEqual(66)
    })

    test("A tx is signed with the ledger nonce", async () => {
        const address = instance.getAddress()
        const ledgerNonce = await instance.provider.getTransactionCount(address)

        const signed_tx = await instance.preparePay(address, "1")

        // INFO: Reconstruct the transaction from the signed payload
        const tx = Transaction.from(signed_tx)

        expect(tx.nonce).toEqual(ledgerNonce)
    })

    test("Transactions are signed with increasing nonces", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => Transaction.from(tx))
        const nonces_sorted = verifyNumberOrder(txs, "nonce", {
            isNonce: true,
        })

        expect(nonces_sorted).toBe(true)
    })

    test("Transactions are signed in order of appearance", async () => {
        const address = instance.getAddress()
        const transfers = getSampleTranfers(address)
        const signed_txs = await instance.preparePays(transfers)

        const txs = signed_txs.map(tx => Transaction.from(tx))
        const values_sorted = verifyNumberOrder(txs, "value")

        expect(values_sorted).toBe(true)
    })

    test.skip("Type of Read contract", async () => {
        const contract = await instance.getContractInstance(
            "0xa2f64eec3E69C0B2E9978AB371A16eaA3a1Cf793",
            '[{"inputs":[{"internalType":"string","name":"name","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"greet","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
        )
        const data = await instance.readFromContract(contract, "greet", [])
        console.log(data)

        interface contractReadParams {
            address: string
            abi: string
            method: string
        }
    })

    test.skip("getTokenBalance", async () => {
        // NOTE: This is USDC on Ethereum mainnet
        // Switch to mainnet on the rpc to test
        const balance = await instance.getTokenBalance(
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "0x500d9257fd8eb4583684E5BEbb65DC1Fa243DDF9",
        )

        console.log(balance)
    })

    test("writeToContract generates valid signed transaction", async () => {
        // REVIEW: Test the updated writeToContract method
        const testERC20ABI = [
            {
                constant: false,
                inputs: [
                    { name: "dst", type: "address" },
                    { name: "wad", type: "uint256" },
                ],
                name: "transfer",
                outputs: [{ name: "", type: "bool" }],
                payable: false,
                stateMutability: "nonpayable",
                type: "function",
            },
        ]

        // Use a mock ERC20 contract address (doesn't need to exist for signing test)
        const mockContractAddress = "0x1234567890123456789012345678901234567890"
        const contract = await instance.getContractInstance(
            mockContractAddress,
            JSON.stringify(testERC20ABI),
        )

        const recipient = "0xa2f64eec3E69C0B2E9978AB371A16eaA3a1Cf793"
        const amount = parseEther("1.0")

        const signedTx = await instance.writeToContract(contract, "transfer", [
            recipient,
            amount,
        ])

        // Verify it's a valid signed transaction
        expect(typeof signedTx).toBe("string")
        expect(signedTx.startsWith("0x")).toBe(true)
        expect(signedTx.length).toBeGreaterThan(100) // Signed transactions are substantial in length

        // Reconstruct transaction to verify structure
        const tx = Transaction.from(signedTx)
        expect(tx.to).toBe(mockContractAddress)
        expect(tx.data).toBeDefined()
        expect(tx.data.length).toBeGreaterThan(10) // Should contain encoded function call
        expect(tx.signature).toBeDefined()
        expect(tx.signature.r).toBeDefined()
        expect(tx.signature.s).toBeDefined()
        expect(tx.signature.v).toBeDefined()
    })

    test("writeToContract with custom gas and value options", async () => {
        // REVIEW: Test custom options support
        const payableABI = [
            {
                constant: false,
                inputs: [],
                name: "deposit",
                outputs: [],
                payable: true,
                stateMutability: "payable",
                type: "function",
            },
        ]

        const mockContractAddress = "0x1234567890123456789012345678901234567890"
        const contract = await instance.getContractInstance(
            mockContractAddress,
            JSON.stringify(payableABI),
        )

        const signedTx = await instance.writeToContract(
            contract,
            "deposit",
            [],
            {
                gasLimit: 100000,
                value: "1",
            },
        )

        // Verify transaction structure
        expect(typeof signedTx).toBe("string")
        expect(signedTx.startsWith("0x")).toBe(true)

        const tx = Transaction.from(signedTx)
        expect(tx.to).toBe(mockContractAddress)
        expect(tx.gasLimit).toBe(BigInt(100000))
        expect(tx.value).toBe(parseEther("1"))

        const xmscript = prepareXMScript({
            chain: "eth",
            signedPayloads: [signedTx],
            subchain: "sepolia",
            type: "contract_write",
            is_evm: true,
        })

        const signedDemosTx = await prepareXMPayload(xmscript, demos)

        const validityData = await demos.confirm(signedDemosTx)
        console.log(validityData)

        const res = await demos.broadcast(validityData)
        console.log(res)
    })

    test.skip("listenForEvent", async () => {
        const eventData = await instance.listenForEvent(
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            '[{"constant":false,"inputs":[{"name":"newImplementation","type":"address"}],"name":"upgradeTo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newImplementation","type":"address"},{"name":"data","type":"bytes"}],"name":"upgradeToAndCall","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[],"name":"implementation","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"changeAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_implementation","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":false,"name":"previousAdmin","type":"address"},{"indexed":false,"name":"newAdmin","type":"address"}],"name":"AdminChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"implementation","type":"address"}],"name":"Upgraded","type":"event"}]',
            "*",
            10000
        )

        try {
            console.log("event data:", eventData)
        } catch (error) {
            console.log("error: here")
            console.log(error)
        }
    }, 2000000)

    test.skip("listenForAllEvents", async () => {
        const removeListener = instance.listenForAllEvents(
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            '[{"constant":false,"inputs":[{"name":"newImplementation","type":"address"}],"name":"upgradeTo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newImplementation","type":"address"},{"name":"data","type":"bytes"}],"name":"upgradeToAndCall","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[],"name":"implementation","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"changeAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_implementation","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":false,"name":"previousAdmin","type":"address"},{"indexed":false,"name":"newAdmin","type":"address"}],"name":"AdminChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"implementation","type":"address"}],"name":"Upgraded","type":"event"}]',
            (data: any) => {
                console.log("event data:", data)
            },
        )

        await new Promise(resolve => setTimeout(resolve, 40000))
        console.log("removing listener")
        removeListener()
    }, 2000000)
})
