import AbstractionProvidersInstance from "../AbstractionProviders"

export default function registerArbitrumProviders() {
    //TODO: Change to private third-party service providers in production for better performance and reliability

    // Mainnet
    AbstractionProvidersInstance().registerEVM("arbitrum", [
        "https://arb1.arbitrum.io/rpc",
        "https://rpc.ankr.com/arbitrum",
        "https://arbitrum.drpc.org",
        "https://arbitrum.meowrpc.com",
        "https://arb-pokt.nodies.app",
    ])

    // Testnet (Sepolia)
    AbstractionProvidersInstance().registerEVM("arbitrum_testnet", [
        "https://sepolia-rollup.arbitrum.io/rpc",
    ])
}
