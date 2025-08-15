/**
 * Chain IDs for various chains
 */
export const chainIds = {
    eth: {
        mainnet: 1,
        ropsten: 3,
        rinkeby: 4,
        goerli: 5,
        sepolia: 11155111,
        holesky: 17000,
    },
    bsc: {
        mainnet: 56,
        testnet: 97,
    },
    arbitrum: {
        mainnet: 42161,
        testnet: 421614, //Sepolia
    },
    optimism: {
        mainnet: 10,
        testnet: 11155420, //Sepolia
    },
}

export enum BaseChain {
    ETHEREUM = "ethereum",
    BSC = "bsc",
    ARBITRUM = "arbitrum",
    OPTIMISM = "optimism",
    SOLANA = "solana",
    MULTIVERSX = "multiversx",
    XRP = "xrp",
    BITCOIN = "bitcoin",
    TON = "ton",
}

/**
 * Types for network types
 */
export type NetworkType = "mainnet" | "testnet"

/**
 * Types for chain types
 */
export type ChainType =
    // EVM chains
    | BaseChain.ETHEREUM
    | BaseChain.BSC
    | BaseChain.ARBITRUM
    | BaseChain.OPTIMISM
    // Non-EVM chains
    | BaseChain.SOLANA
    | BaseChain.MULTIVERSX
    | BaseChain.XRP
    | BaseChain.BITCOIN
    | BaseChain.TON

/**
 * Type for supported chains
 */
export type SupportedChain = `${BaseChain}_${NetworkType}`

/**
 * Token addresses for various chains
 */
export const tokenAddresses = {
    // ETH on EVM chains
    ethereum: {
        mainnet: "0x0000000000000000000000000000000000000000",
        sepolia: "0x0000000000000000000000000000000000000000",
        wrapped: {
            ethereum: {
                mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                testnet: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Sepolia
            },
            bsc: {
                mainnet: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
                testnet: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // BSC Testnet
            },
            arbitrum: {
                mainnet: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
                testnet: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Sepolia
            },
            optimism: {
                mainnet: "0x4200000000000000000000000000000000000006",
                testnet: "0x4200000000000000000000000000000000000006", // Sepolia
            },
        },
    },
    // SOL on EVM chains
    solana: {
        mainnet: "So11111111111111111111111111111111111111112",
        testnet: "So11111111111111111111111111111111111111112",
        wrapped: {
            ethereum: {
                mainnet: "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
                testnet: "", // TODO: Need to verify Sepolia wSOL address
            },
            bsc: {
                mainnet: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
                testnet: "", // TODO: Need to verify BSC testnet wSOL address
            },
            arbitrum: {
                mainnet: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
                testnet: "", // TODO: Need to verify Arbitrum Sepolia wSOL address
            },
            optimism: {
                mainnet: "", // TODO: Need to verify Optimism wSOL address
                testnet: "", // TODO: Need to verify Optimism Sepolia wSOL address
            },
        },
    },
    // XRP on EVM chains
    xrp: {
        mainnet: "XRP",
        testnet: "XRP",
        wrapped: {
            ethereum: {
                mainnet: "0x39fBBABf11738317a448031930706cd3e612e1B9",
                testnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify Sepolia wXRP address
            },
            bsc: {
                mainnet: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
                testnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify BSC testnet wXRP address
            },
            arbitrum: {
                mainnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify Arbitrum wXRP address
                testnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify Arbitrum Sepolia wXRP address
            },
            optimism: {
                mainnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify Optimism wXRP address
                testnet: "0x0000000000000000000000000000000000000000", // TODO: Need to verify Optimism Sepolia wXRP address
            },
        },
    },
    // BTC on EVM chains
    bitcoin: {
        mainnet: "BTC",
        testnet: "BTC",
        wrapped: {
            ethereum: {
                mainnet: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
                testnet: "0x92c63d0e701CAAe670C9415d91C474F686298f00", // Sepolia WBTC
            },
            bsc: {
                mainnet: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB
                testnet: "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8", // BSC Testnet BTCB
            },
            arbitrum: {
                mainnet: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
                testnet: "", // TODO: Need to verify Arbitrum Sepolia WBTC address
            },
            optimism: {
                mainnet: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", // WBTC
                testnet: "", // TODO: Need to verify Optimism Sepolia WBTC address
            },
        },
    },
    // MultiversX on EVM chains
    multiversx: {
        mainnet: "EGLD",
        testnet: "EGLD",
        wrapped: {
            ethereum: {
                mainnet: "", // TODO: Need to verify if WEGLD exists on Ethereum
                testnet: "", // TODO: Need to verify Sepolia WEGLD address
            },
            bsc: {
                mainnet: "0xbF7c81FFF98BbE61B40Ed186e4AfD6DDd01337fe", // WEGLD
                testnet: "", // TODO: Need to verify BSC testnet WEGLD address
            },
            arbitrum: {
                mainnet: "", // TODO: Need to verify if WEGLD exists on Arbitrum
                testnet: "", // TODO: Need to verify if WEGLD exists on Arbitrum Sepolia
            },
            optimism: {
                mainnet: "", // TODO: Need to verify if WEGLD exists on Optimism
                testnet: "", // TODO: Need to verify if WEGLD exists on Optimism Sepolia
            },
        },
    },
    // Stablecoins
    usdc: {
        ethereum: {
            mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            testnet: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia
        },
        bsc: {
            mainnet: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            testnet: "0x64544969ed7EBf5f083679233325356EbE738930", // BSC Testnet
        },
        arbitrum: {
            mainnet: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
            testnet: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Sepolia
        },
        optimism: {
            mainnet: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
            testnet: "0x0000000000000000000000000000000000000000", //TODO: Cannot verify this address on Sepolia
        },
        // Non-EVM chains
        solana: {
            mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            testnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        },
        multiversx: {
            mainnet: "USDC-c76f1f",
            testnet: "USDC-8d4068", //TODO: Cannot verify this
        },
        xrp: {
            mainnet: "", // TODO: Not supported yet
            testnet: "", // TODO: Not supported yet
        },
        ton: {
            mainnet: "", // TODO: Need authoritative source to verify USDC address on TON
            testnet: "", // Not available on testnet
        },
    },
    usdt: {
        ethereum: {
            mainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            testnet: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Sepolia
        },
        bsc: {
            mainnet: "0x55d398326f99059fF775485246999027B3197955",
            testnet: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", // BSC Testnet
        },
        arbitrum: {
            mainnet: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            testnet: "0x0000000000000000000000000000000000000000", //TODO: Cannot verify this address on Sepolia
        },
        optimism: {
            mainnet: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
            testnet: "0x0000000000000000000000000000000000000000", // TODO: Cannot verify this address on Sepolia
        },
        // Non-EVM chains
        solana: {
            mainnet: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            testnet: "", // USDT not available on testnet
        },
        multiversx: {
            mainnet: "", // TODO: Need authoritative source to verify USDT token ID
            testnet: "", // TODO: Need authoritative source to verify USDT token ID
        },
        xrp: {
            mainnet: "", // TODO: Not supported yet
            testnet: "", // TODO: Not supported yet
        },
        ton: {
            mainnet: "", // TODO: Need authoritative source to verify USDT address on TON
            testnet: "", // Not available on testnet
        },
    },
}
