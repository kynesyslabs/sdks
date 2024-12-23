import AbstractionProvidersInstance from "../AbstractionProviders"

export default function registerBitcoinProviders() {
    // Mainnet
    AbstractionProvidersInstance().bitcoin.mainnet = [
        "https://blockstream.info/api", // Blockstream Explorer API
        "https://mempool.space/api", // Mempool.space API
        "https://api.blockcypher.com/v1/btc/main", // BlockCypher API
        "https://api.blockchain.info", // Blockchain.info API
    ]

    // Testnet
    AbstractionProvidersInstance().bitcoin.testnet = [
        "https://blockstream.info/testnet/api", // Blockstream Testnet
        "https://mempool.space/testnet/api", // Mempool.space Testnet
        "https://api.blockcypher.com/v1/btc/test3", // BlockCypher Testnet
    ]
}
