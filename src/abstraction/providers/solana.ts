import AbstractionProvidersInstance from "./AbstractionProviders"
import { clusterApiUrl } from "@solana/web3.js"

export default function registerSolanaProviders() {
    // Mainnet
    AbstractionProvidersInstance().solana.mainnet = [
        "https://api.mainnet-beta.solana.com",
        clusterApiUrl("mainnet-beta"),
        "https://solana-api.projectserum.com",
    ]

    // Testnet
    AbstractionProvidersInstance().solana.testnet = [
        "https://api.testnet.solana.com",
        clusterApiUrl("testnet"),
    ]
}
