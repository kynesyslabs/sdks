import AbstractionProvidersInstance from "./AbstractionProviders"

export default function registerBitcoinProviders() {
    // Mainnet
    AbstractionProvidersInstance().bitcoin.mainnet = [
        "https://blockstream.info/api",
        "https://mempool.space/api",
    ]

    // Testnet
    AbstractionProvidersInstance().bitcoin.testnet = [
        "https://blockstream.info/testnet/api",
        "https://mempool.space/testnet/api",
    ]
}
