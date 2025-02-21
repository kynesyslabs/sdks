import { ethers } from "ethers"
import { RubicService } from "@/services/RubicService"

describe("RubicService", () => {
    let rubicService: RubicService
    let mockSigner: ethers.Signer

    beforeEach(() => {
        const privateKey =
            "YOUR_PRIVATE_KEY" // Replace with your actual private key
        mockSigner = new ethers.Wallet(privateKey)
        rubicService = new RubicService(mockSigner, 1, "ALL")
    })

    test("should initialize SDK", async () => {
        await rubicService["initializeSDK"]()
        expect(rubicService["sdk"]).toBeDefined()
    })

    test("should get token address", () => {
        const usdcAddress = rubicService.getTokenAddress(1, "USDC")
        expect(usdcAddress).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
    })

    test("should get trade", async () => {
        await rubicService["initializeSDK"]()
        const trade = await rubicService.getTrade("USDT", "USDT", "10", 137, 1)

        expect(trade).toBeDefined()
        expect(trade.trade).not.toBeNull()
        expect(trade.error).not.toBeDefined()
    })

    test('should execute trade', async () => {
        await rubicService['initializeSDK']();
        const trade = await rubicService.getTrade('USDT', 'USDT', '8', 137, 1);
        console.log("trade", trade);

        if (trade.error) {
            throw new Error(`Trade calculation failed: ${trade.error.message}`);
        }

        const receipt = await rubicService.executeTrade(trade);
        console.log("receipt", receipt);

        expect(receipt).toBeDefined();
    });

    test("should get blockchain name", () => {
        const blockchainName = rubicService.getBlockchainName(1)
        expect(blockchainName).toBe("ETH")
    })
})
