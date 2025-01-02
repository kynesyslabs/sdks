import AbstractionProvidersInstance from "../AbstractionProviders"
import { chainIds } from "../CoinAddresses"

export default function registerEthereumProviders() {
    //TODO: Change to private third-party service providers in production for better performance and reliability

    // Mainnet
    AbstractionProvidersInstance().registerEVM(
        chainIds.eth.mainnet.toString(),
        [
            "https://rpc.ankr.com/eth",
            "https://eth.drpc.org",
            "https://eth.llamarpc.com",
            "https://ethereum.publicnode.com",
            "https://rpc.flashbots.net",
            "https://rpc.payload.de",
            "https://singapore.rpc.blxrbdn.com",
            "https://uk.rpc.blxrbdn.com",
            "https://virginia.rpc.blxrbdn.com",
        ],
    )

    // Testnet (Sepolia)
    AbstractionProvidersInstance().registerEVM(
        chainIds.eth.sepolia.toString(),
        [
            "https://rpc.ankr.com/eth_sepolia",
            "https://eth-sepolia.public.blastapi.io",
            "https://endpoints.omniatech.io/v1/eth/sepolia/public",
            "https://1rpc.io/sepolia",
            "https://ethereum-sepolia.blockpi.network/v1/rpc/private",
        ],
    )
}
