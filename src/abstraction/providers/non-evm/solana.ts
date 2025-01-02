import AbstractionProvidersInstance from "../AbstractionProviders"
import { clusterApiUrl } from "@solana/web3.js"

export default function registerSolanaProviders() {
    // Mainnet
    AbstractionProvidersInstance().solana.mainnet = [
        "https://api.mainnet-beta.solana.com", // Official RPC
        clusterApiUrl("mainnet-beta"), // Official Backup
        "https://solana.api.chainstack.com/mainnet-beta", // Chainstack
        "https://api.metaplex.solana.com", // Metaplex
    ]

    // Testnet
    AbstractionProvidersInstance().solana.testnet = [
        "https://api.testnet.solana.com", // Official Testnet
        clusterApiUrl("testnet"), // Official Backup
        "https://api.metaplex.solana.com/testnet", // Metaplex Testnet
    ]
}
