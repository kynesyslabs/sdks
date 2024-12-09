// ! This is an absolute test and could be changed anytime

export const tokenAddresses = {
    // ANCHOR Ethereum
    eth: {
        mainnet: "0x0000000000000000000000000000000000000000",
        sepolia: "0x0000000000000000000000000000000000000000",
        holesky: "0x0000000000000000000000000000000000000000",
        wrapped: {
            polygon: {
                mainnet: "0x0000000000000000000000000000000000000000",
            }
        }
    },
    // ANCHOR Bitcoin
    btc: {
        mainnet: "0x0000000000000000000000000000000000000000",
        wrapped: {
            ethereum: {
                mainnet: "0x0000000000000000000000000000000000000000",
                sepolia: "0x0000000000000000000000000000000000000000",
                holesky: "0x0000000000000000000000000000000000000000",
            },
            polygon: {
                mainnet: "0x0000000000000000000000000000000000000000",
            }
        }
    },
}
