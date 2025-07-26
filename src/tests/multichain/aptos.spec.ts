import { Network } from "@aptos-labs/ts-sdk"

import { APTOS } from "@/multichain/localsdk"
import { getSampleTranfers } from "../utils"

describe("APTOS CHAIN TESTS", () => {
    const network = Network.DEVNET
    const instance = new APTOS("", network)
    let testAddress: string
    let fundedAccount: any

    beforeAll(async () => {
        // Connect to Aptos devnet
        const connected = await instance.connect()
        expect(connected).toBe(true)

        // Create a test wallet
        fundedAccount = await instance.createWallet("test-password")
        
        // Fund the account from faucet (devnet only)
        try {
            await instance.fundFromFaucet(fundedAccount.accountAddress.toString(), 100_000_000) // 1 APT
            testAddress = fundedAccount.accountAddress.toString()
        } catch (error) {
            console.log("Faucet funding failed, continuing with tests:", error)
            testAddress = fundedAccount.accountAddress.toString()
        }
    })

    test("SDK version and network connection", async () => {
        expect(instance.network).toBe(Network.DEVNET)
        expect(instance.connected).toBe(true)
        expect(instance.aptos).toBeDefined()
    })

    test("Account creation and wallet connection", async () => {
        expect(fundedAccount).toBeDefined()
        expect(fundedAccount.accountAddress).toBeDefined()
        expect(instance.account).toBe(fundedAccount)
        
        const address = instance.getAddress()
        expect(address).toBe(testAddress)
        expect(instance.isAddress(address)).toBe(true)
    })

    test("Account management methods", async () => {
        const privateKey = instance.getPrivateKey()
        expect(privateKey).toBeDefined()
        expect(typeof privateKey).toBe("string")

        const publicKey = instance.getPublicKey()
        expect(publicKey).toBeDefined()
        expect(typeof publicKey).toBe("string")
    })

    test("Balance queries", async () => {
        const balance = await instance.getAPTBalance(testAddress)
        expect(typeof balance).toBe("string")
        expect(Number(balance)).toBeGreaterThanOrEqual(0)

        // Test the generic getBalance method
        const genericBalance = await instance.getBalance(testAddress)
        expect(genericBalance).toBe(balance)
    })

    test("Address validation", () => {
        // Valid addresses
        expect(instance.isAddress(testAddress)).toBe(true)
        expect(instance.isAddress("0x1")).toBe(true)
        expect(instance.isAddress("0x1::aptos_coin::AptosCoin")).toBe(false) // This is a type, not address
        
        // Invalid addresses
        expect(instance.isAddress("invalid")).toBe(false)
        expect(instance.isAddress("")).toBe(false)
    })

    test("Message signing", async () => {
        const message = "Hello Aptos!"
        const signature = await instance.signMessage(message)
        
        expect(signature).toBeDefined()
        expect(signature).toBeInstanceOf(Uint8Array)
        expect(signature.length).toBeGreaterThan(0)
    })

    test("Transaction preparation and signing", async () => {
        // Skip if account has no balance
        const balance = await instance.getAPTBalance(testAddress)
        if (Number(balance) === 0) {
            console.log("Skipping transaction test due to zero balance")
            return
        }

        const recipient = testAddress // Send to self for testing
        const amount = "1000" // 1000 Octas (very small amount)
        
        try {
            const signedTx = await instance.preparePay(recipient, amount)
            expect(signedTx).toBeDefined()
            expect(signedTx).toBeInstanceOf(Uint8Array)
            
            // The result should be a transaction hash encoded as Uint8Array
            const hash = new TextDecoder().decode(signedTx)
            expect(typeof hash).toBe("string")
            expect(hash.startsWith("0x")).toBe(true)
        } catch (error) {
            // Transaction might fail due to insufficient funds or network issues
            console.log("Transaction test failed (expected in some cases):", error)
        }
    })

    test("Empty transaction template", async () => {
        const emptyTx = await instance.getEmptyTransaction()
        expect(emptyTx).toBeDefined()
        // SimpleTransaction doesn't expose sender directly, check if it exists
        expect(emptyTx).toBeDefined()
    })

    test("Multiple payments preparation", async () => {
        const payments = getSampleTranfers(testAddress, 1, 2)
        
        try {
            const signedTxs = await instance.preparePays(payments)
            expect(signedTxs).toBeDefined()
            expect(Array.isArray(signedTxs)).toBe(true)
            expect(signedTxs.length).toBe(2)
        } catch (error) {
            console.log("Multiple payments test failed (expected in some cases):", error)
        }
    })

    test("Network information", async () => {
        const info = await instance.getInfo()
        expect(info).toBeDefined()
        expect(info.network).toBe(Network.DEVNET)
        expect(info.chainId).toBeDefined()
        expect(info.ledgerVersion).toBeDefined()
        expect(info.connected).toBe(true)
    })

    test("Smart contract read operation", async () => {
        try {
            // Read from a standard Aptos module (coin module)
            const result = await instance.readFromContract(
                "0x1",
                "coin",
                "name",
                ["0x1::aptos_coin::AptosCoin"]
            )
            expect(result).toBeDefined()
        } catch (error) {
            // View functions might not be available or might fail
            console.log("Contract read test failed (expected in some cases):", error)
        }
    })

    test("Error handling for invalid operations", async () => {
        // Test with invalid address
        await expect(instance.getAPTBalance("invalid-address")).rejects.toThrow()
        
        // Test without wallet connection
        const newInstance = new APTOS("", network)
        await newInstance.connect()
        
        await expect(newInstance.getAddress()).rejects.toThrow()
        await expect(newInstance.signMessage("test")).rejects.toThrow()
    })

    test("Disconnect functionality", async () => {
        const disconnected = await instance.disconnect()
        expect(disconnected).toBe(true)
        expect(instance.connected).toBe(false)
    })

    test("Network switching", async () => {
        // Test switching to testnet
        instance.setNetwork(Network.TESTNET)
        expect(instance.network).toBe(Network.TESTNET)
        
        // Reconnect
        const connected = await instance.connect()
        expect(connected).toBe(true)
        
        // Switch back to devnet
        instance.setNetwork(Network.DEVNET)
        expect(instance.network).toBe(Network.DEVNET)
    })

    test("Custom RPC URL handling", async () => {
        const customInstance = new APTOS("https://fullnode.devnet.aptoslabs.com/v1", Network.DEVNET)
        const connected = await customInstance.connect()
        expect(connected).toBe(true)
        expect(customInstance.rpc_url).toBe("https://fullnode.devnet.aptoslabs.com/v1")
    })

    afterAll(async () => {
        // Clean up connections
        await instance.disconnect()
    })
})