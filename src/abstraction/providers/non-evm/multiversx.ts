import AbstractionProvidersInstance from "../AbstractionProviders"

export default function registerMultiversxProviders() {
    // Mainnet
    AbstractionProvidersInstance().multiversx.mainnet = [
        "https://api.multiversx.com", // Official API
        "https://gateway.multiversx.com", // Official Gateway
        "https://api.elrond.com", // Legacy endpoint, still maintained
        "https://elrond-api.public.blastapi.io", // Blast API public endpoint
    ]

    // Testnet
    AbstractionProvidersInstance().multiversx.testnet = [
        "https://testnet-api.multiversx.com", // Official Testnet API
        "https://testnet-gateway.multiversx.com", // Official Testnet Gateway
        "https://testnet-api.elrond.com", // Legacy testnet, still maintained
    ]
}
