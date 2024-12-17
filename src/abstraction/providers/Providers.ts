import AbstractionProvidersInstance from "./AbstractionProviders"
import registerEthereumProviders from "./ethereum"
import registerBscProviders from "./bsc"
import registerArbitrumProviders from "./arbitrum"
import registerOptimismProviders from "./optimism"

// Register all blockchain providers
registerEthereumProviders()
registerBscProviders()
registerArbitrumProviders()
registerOptimismProviders()

const Providers = AbstractionProvidersInstance()
export default Providers
