import AbstractionProvidersInstance from "./AbstractionProviders"
import registerEthereumProviders from "./ethereum"
import registerBscProviders from "./bsc"
import registerArbitrumProviders from "./arbitrum"
import registerOptimismProviders from "./optimism"
import registerSolanaProviders from "./solana"
import registerMultiversxProviders from "./multiversx"
import registerXrpProviders from "./xrp"
import registerBitcoinProviders from "./bitcoin"

// Register all blockchain providers
// EVM
registerEthereumProviders()
registerBscProviders()
registerArbitrumProviders()
registerOptimismProviders()

// Non-EVM
registerSolanaProviders()
registerMultiversxProviders()
registerXrpProviders()
registerBitcoinProviders()

const Providers = AbstractionProvidersInstance()
export default Providers
