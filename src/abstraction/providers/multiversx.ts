import AbstractionProvidersInstance from "./AbstractionProviders"

export default function registerMultiversxProviders() {
    // Mainnet
    AbstractionProvidersInstance().multiversx.mainnet = [
        "https://api.multiversx.com",
        "https://gateway.multiversx.com",
    ]

    // Testnet
    AbstractionProvidersInstance().multiversx.testnet = [
        "https://testnet-api.multiversx.com",
        "https://testnet-gateway.multiversx.com",
    ]
}
