/** NOTE
 *  This file registers the providers for the ankr network.
 *  INFO for developers:
 *  - Note how the providers are registered for each chain.
 *  - You can use this as a template for registering new providers.
 */
import AbstractionProvidersInstance from "./AbstractionProviders"

export default function registerAnkrProviders() {
    // ANCHOR Evm chains

    // SECTION Ethereum
    AbstractionProvidersInstance().registerEVM("ethereum", [
        "https://rpc.ankr.com/eth",
    ])
    AbstractionProvidersInstance().registerEVM("ethereum_holesky", [
        "https://rpc.ankr.com/eth_holesky",
    ])
    AbstractionProvidersInstance().registerEVM("ethereum_sepolia", [
        "https://rpc.ankr.com/eth_sepolia",
    ])

    // ANCHOR Non-EVM chains

    // SECTION Bitcoin
    AbstractionProvidersInstance().registerChainProviders(
        "bitcoin",
        "mainnet",
        ["https://rpc.ankr.com/btc"],
    )
    AbstractionProvidersInstance().registerChainProviders(
        "bitcoin",
        "testnet",
        ["https://rpc.ankr.com/btc_signet"],
    )

    // SECTION Solana
    AbstractionProvidersInstance().registerChainProviders("solana", "devnet", [
        "https://rpc.ankr.com/solana_devnet",
    ])

    // TODO Add providers from ankr for other chains
}
