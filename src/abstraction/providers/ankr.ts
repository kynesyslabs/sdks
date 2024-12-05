/** NOTE
 *  This file registers the providers for the ankr network.
 *  INFO for developers:
 *  - Note how the providers are registered for each chain.
 *  - You can use this as a template for registering new providers.
 */
import Providers from "./Providers"

// ANCHOR Evm chains

// SECTION Ethereum
Providers().registerEVM("ethereum", ["https://rpc.ankr.com/eth"])
Providers().registerEVM("ethereum_holesky", ["https://rpc.ankr.com/eth_holesky"])
Providers().registerEVM("ethereum_sepolia", ["https://rpc.ankr.com/eth_sepolia"])

// ANCHOR Non-EVM chains

// SECTION Bitcoin
Providers().registerChainProviders("bitcoin", "mainnet", [
    "https://rpc.ankr.com/btc",
])
Providers().registerChainProviders("bitcoin", "testnet", [
    "https://rpc.ankr.com/btc_signet",
])

// SECTION Solana
Providers().registerChainProviders("solana", "devnet", [
    "https://rpc.ankr.com/solana_devnet",
])

// TODO Add providers from ankr for other chains