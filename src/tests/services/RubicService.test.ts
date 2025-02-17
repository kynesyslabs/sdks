import { ethers } from 'ethers';
import { RubicService } from '@/services/RubicService';

describe('RubicService', () => {
    let rubicService: RubicService;
    let mockSigner: ethers.Signer;

    beforeEach(() => {
        mockSigner = ethers.Wallet.createRandom();
        rubicService = new RubicService(mockSigner, 1, 'ALL');
    });

    test('should initialize SDK', async () => {
        await rubicService['initializeSDK']();
        expect(rubicService['sdk']).toBeDefined();
    });

    test('should get token address', () => {
        const usdcAddress = rubicService.getTokenAddress(1, 'USDC');
        expect(usdcAddress).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    // test('should get trade', async () => {
    //     await rubicService['initializeSDK']();
    //     const trade = await rubicService.getTrade('USDT', 'USDT', '100', 1, 137);
    //     expect(trade).toBeDefined();
    // });

    // test('should execute trade', async () => {
    //     await rubicService['initializeSDK']();
    //     const trade = await rubicService.getTrade('USDC', 'USDT', '1000000', 1, 137);
    //     const receipt = await rubicService.executeTrade(trade);
    //     expect(receipt).toBeDefined();
    // });

    test('should get blockchain name', () => {
        const blockchainName = rubicService.getBlockchainName(1);
        expect(blockchainName).toBe('ETH');
    });
});
