import AbstractionProvidersInstance from "./AbstractionProviders"
import {
    registerEthereumProviders,
    registerBscProviders,
    registerArbitrumProviders,
    registerOptimismProviders,
} from "./evm"
import {
    registerSolanaProviders,
    registerMultiversxProviders,
    registerXrpProviders,
    registerBitcoinProviders,
} from "./non-evm"

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
