/** NOTE
 *  This is the singleton class that contains the list of providers for the abstraction layer.
 *  It also contains the methods to register new providers.
 * 
 *  INFO for developers:
 *  - The providers can be registered by adding a new provider registration file in the ./index.ts file.
 *  - The provider registration files use the registerEVM and registerChainProviders methods to register the providers.
 *  - The registerEVM method takes a chainId and an array of RPC URLs as arguments.
 *  - The registerChainProviders method takes a chain type, a network, and an array of RPC URLs as arguments.
 *  - For an example of how to register a new provider, see the ./ankr.ts file.
 *  - The Providers.ts file export the singleton instance of the AbstractionProviders class, already registered with all providers.
 * 
 *  NOTE: The Providers object should only used internally (e.g. in EvmCoinFinder.ts and CoinFinder.ts).
 * This is due to the fact that it is initialized with all the providers at runtime.
 */
class _AbstractionProviders {
    static _instance: _AbstractionProviders

    // This is the list of providers for the abstraction layer
    constructor() {
        this.evm = {}
        this.solana = {
            mainnet: [],
            devnet: [],
            testnet: [],
        }
        this.multiversx = {
            mainnet: [],
            devnet: [],
            testnet: [],
        }
        this.xrp = {
            mainnet: [],
            testnet: [],
        }
        this.bitcoin = {
            mainnet: [],
            testnet: [],
        }
    }

    // Singleton
    static getInstance() {
        if (!_AbstractionProviders._instance) {
            _AbstractionProviders._instance = new _AbstractionProviders()
        }
        return _AbstractionProviders._instance
    }

    evm: {
        [chainName: string]: string[] // Array of RPC URLs
    }
    solana: {
        [key in "mainnet" | "devnet" | "testnet"]: string[] // Array of RPC URLs
    }

    multiversx: {
        [key in "mainnet" | "devnet" | "testnet"]: string[] // Array of RPC URLs
    }

    xrp: {
        [key in "mainnet" | "testnet"]: string[] // Array of RPC URLs
    }

    bitcoin: {
        [key in "mainnet" | "testnet"]: string[] // Array of RPC URLs
    }

    // Register EVM providers
    registerEVM(chainName: string, rpcUrls: string[]) {
        if (!this.evm[chainName]) {
            this.evm[chainName] = []
        }
        this.evm[chainName].push(...rpcUrls)
    }

    // Register chain providers
    registerChainProviders(
        chain: "solana" | "multiversx" | "xrp" | "bitcoin",
        network: string,
        rpcUrls: string[],
    ) {
        if (this[chain] && this[chain][network]) {
            this[chain][network].push(...rpcUrls)
        }
    }

    // TODO Add more chains as we add support for them
}

// Create and initialize the singleton immediately
// NOTE We export the getInstance method instead of the instance itself to ensure we update the singleton each time
const AbstractionProvidersInstance = _AbstractionProviders.getInstance

// Export the initialized instance
export default AbstractionProvidersInstance
