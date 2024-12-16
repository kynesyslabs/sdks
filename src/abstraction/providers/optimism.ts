import AbstractionProvidersInstance from "./AbstractionProviders"

export default function registerOptimismProviders() {
    //TODO: Change to private third-party service providers in production for better performance and reliability

    // Mainnet
    AbstractionProvidersInstance().registerEVM("optimism", [
        "https://mainnet.optimism.io",
        "https://rpc.ankr.com/optimism",
        "https://endpoints.omniatech.io/v1/op/mainnet/public",
        "https://optimism-rpc.publicnode.com",
        "https://optimism.drpc.org",
        "https://optimism.meowrpc.com",
    ])

    // Testnet (Sepolia)
    AbstractionProvidersInstance().registerEVM("optimism-sepolia", [
        "https://api.zan.top/opt-sepolia",
        "https://optimism-sepolia.gateway.tenderly.co",
        "https://endpoints.omniatech.io/v1/op/sepolia/public",
        "https://optimism-sepolia.drpc.org",
    ])
}
