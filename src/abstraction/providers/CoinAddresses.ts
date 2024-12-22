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

export const tokenAddresses = {
    // EVM chains
    eth: {
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
        solana: {
            mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            testnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        },
        multiversx: {
            mainnet: "USDC-c76f1f",
            testnet: "USDC-8d4068",
        },
        xrp: {
            mainnet: "usdc",
            testnet: "usdc",
        },
        ton: {
            mainnet:
                "0:c37b3fafca5bf7d3704b081fde7df54f298736ee059bf6d32fac25f5e6085bf6",
            testnet: "",
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
    },
    // Non-EVM chains
    sol: {
        mainnet: "So11111111111111111111111111111111111111112",
        testnet: "So11111111111111111111111111111111111111112",
    },
    multiversx: {
        mainnet: "EGLD-bd4d79",
        testnet: "WEGLD-d7c6bb",
    },
    xrp: {
        mainnet: "XRP",
        testnet: "XRP",
    },
    btc: {
        mainnet: "BTC",
        testnet: "BTC",
    },
    ton: {
        mainnet: "TON",
        testnet: "TON",
    },
}
