import { SDK, Configuration, BLOCKCHAIN_NAME, CrossChainManagerCalculationOptions } from 'rubic-sdk';
import { ethers } from 'ethers';

const SUPPORTED_TOKENS = {
  [BLOCKCHAIN_NAME.ETHEREUM]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  [BLOCKCHAIN_NAME.POLYGON]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
  },
  [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955'
  },
  [BLOCKCHAIN_NAME.AVALANCHE]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'
  },
  [BLOCKCHAIN_NAME.OPTIMISM]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'
  },
  [BLOCKCHAIN_NAME.ARBITRUM]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
  },
  [BLOCKCHAIN_NAME.LINEA]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
    USDT: '0xA219439258ca9da29E9Cc4cE5596924745e12B93'
  },
  [BLOCKCHAIN_NAME.BASE]: {
    NATIVE: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
  },
  [BLOCKCHAIN_NAME.SOLANA]: {
    NATIVE: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  }
};

export const BRIDGE_PROTOCOLS = {
  ALL: 'all',
  MULTICHAIN: 'multichain',
  CELER: 'celer',
  SYMBIOSIS: 'symbiosis',
  AXELAR: 'axelar',
  WORMHOLE: 'wormhole'
} as const;

interface ExtendedCrossChainManagerCalculationOptions extends CrossChainManagerCalculationOptions {
  bridgeTypes?: string[];
}

export type BlockchainName = (typeof BLOCKCHAIN_NAME)[keyof typeof BLOCKCHAIN_NAME];

export type BridgeProtocol = keyof typeof BRIDGE_PROTOCOLS;

export class RubicService {
  private sdk: SDK;
  private signer: ethers.Signer;
  private chainId: number;
  private selectedProtocol: BridgeProtocol = 'ALL';

  constructor(signer: ethers.Signer, chainId: number, protocol: BridgeProtocol = 'ALL') {
    this.signer = signer;
    this.chainId = chainId;
    this.selectedProtocol = protocol;
    this.initializeSDK();
  }

  private async initializeSDK() {
    const configuration: Configuration = {
      rpcProviders: {
        [BLOCKCHAIN_NAME.ETHEREUM]: {
          rpcList: ['https://eth.llamarpc.com']
        },
        [BLOCKCHAIN_NAME.POLYGON]: {
          rpcList: ['https://polygon.llamarpc.com']
        },
        [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: {
          rpcList: ['https://bsc.publicnode.com']
        },
        [BLOCKCHAIN_NAME.AVALANCHE]: {
          rpcList: ['https://avalanche.public-rpc.com']
        },
        [BLOCKCHAIN_NAME.OPTIMISM]: {
          rpcList: ['https://optimism.llamarpc.com']
        },
        [BLOCKCHAIN_NAME.ARBITRUM]: {
          rpcList: ['https://arbitrum.llamarpc.com']
        },
        [BLOCKCHAIN_NAME.LINEA]: {
          rpcList: ['https://linea.drpc.org']
        },
        [BLOCKCHAIN_NAME.BASE]: {
          rpcList: ['https://base.drpc.org']
        },
        [BLOCKCHAIN_NAME.SOLANA]: {
          rpcList: ['https://api.mainnet-beta.solana.com']
        }
      }
    };

    this.sdk = await SDK.createSDK(configuration);
  }

  getTokenAddress(chainId: number, symbol: 'NATIVE' | 'USDC' | 'USDT') {
    const blockchain = this.getBlockchainName(chainId);
    return SUPPORTED_TOKENS[blockchain][symbol];
  }

  async getTrade(
    fromToken: 'NATIVE' | 'USDC' | 'USDT',
    toToken: 'NATIVE' | 'USDC' | 'USDT',
    amount: string,
    fromChainId: number,
    toChainId: number
  ): Promise<any> {
    try {
      const fromTokenAddress = this.getTokenAddress(fromChainId, fromToken);
      const toTokenAddress = this.getTokenAddress(toChainId, toToken);

      const trades = await this.sdk.crossChainManager.calculateTrade(
        {
          address: fromTokenAddress,
          blockchain: this.getBlockchainName(fromChainId)
        },
        amount,
        {
          address: toTokenAddress,
          blockchain: this.getBlockchainName(toChainId)
        },
        {
          bridgeTypes: this.selectedProtocol === 'ALL' ? 
            Object.values(BRIDGE_PROTOCOLS).filter(p => p !== 'all').map(p => p.toLowerCase()) : 
            [this.selectedProtocol.toLowerCase()]
        } as ExtendedCrossChainManagerCalculationOptions
      );

      const sortedTrades = trades.sort((a, b) => {
        const aScore = this.calculateTradeScore(a);
        const bScore = this.calculateTradeScore(b);
        return bScore - aScore;
      });

      return sortedTrades[0];
    } catch (error) {
      console.error('Error getting trade:', error);
      throw error;
    }
  }

  private calculateTradeScore(trade: any): number {
    const slippage = trade.slippage || 0.01;
    const estimatedTime = trade.estimatedTime || 300;
    const gasPrice = trade.gasPrice || 50;

    const slippageScore = (1 / slippage) * 100;
    const speedScore = (1000 / estimatedTime) * 100;
    const costScore = (1 / gasPrice) * 100;

    return (slippageScore * 0.4) + (speedScore * 0.3) + (costScore * 0.3);
  }

  async executeTrade(trade: any) {
    try {
      const receipt = await trade.swap({
        signer: this.signer,
        onConfirm: (hash: string) => {
          console.log('Transaction confirmed:', hash);
        }
      });
      return receipt;
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }

  getBlockchainName(chainId: number): BlockchainName {
    switch (chainId) {
      case 1:
        return BLOCKCHAIN_NAME.ETHEREUM;
      case 137:
        return BLOCKCHAIN_NAME.POLYGON;
      case 56:
        return BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN;
      case 43114:
        return BLOCKCHAIN_NAME.AVALANCHE;
      case 10:
        return BLOCKCHAIN_NAME.OPTIMISM;
      case 42161:
        return BLOCKCHAIN_NAME.ARBITRUM;
      case 59144:
        return BLOCKCHAIN_NAME.LINEA;
      case 8453:
        return BLOCKCHAIN_NAME.BASE;
      case 101:
        return BLOCKCHAIN_NAME.SOLANA;
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}
