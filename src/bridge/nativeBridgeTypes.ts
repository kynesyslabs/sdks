// We separate the types from the methods to avoid circular dependencies (transactions mainly)

// Supported chains and stablecoins
export const supportedChains = ["EVM", "SOLANA"] as const
export const supportedStablecoins = ["USDC"] as const

// Types for the operation
// NOTE: This will be sent from the client to the node
export type BridgeOperation = {
    demoAddress: string
    originChainType: SupportedChain
    originChain: SupportedEVMChain | SupportedNonEVMChain
    destinationChainType: SupportedChain
    destinationChain: SupportedEVMChain | SupportedNonEVMChain
    originAddress: string
    destinationAddress: string
    amount: string
    token: SupportedStablecoin
    txHash: string
    status: "empty" | "pending" | "completed" | "failed"
}

// Types compiled from the node
// NOTE: This will be sent back from the node to the client
export type BridgeOperationCompiled = {
    content: {
        operation: BridgeOperation
        amountExpected: number // Amount of tokens expected to be received
        validUntil: number // Block number until which the operation is valid
    } & (
        | {
              originChain: "EVM"
              contractAddress: string // Address of the tank contract
              contractABI: string[]
          }
        | {
              originChain: "SOLANA"
              solanaAddress: string // Address of the tank account
          }
    )
    signature: string // Signed hash of the content
    rpc: string // public key of the node that sent us back the operation
}

// Supported chains for EVM
export const supportedEVMChains = [
    "eth",
    "polygon",
    "bsc",
    "arbitrum",
    "optimism",
    "avalanche",
    "base",
] as const

export const supportedNonEVMChains = ["SOLANA"] as const

// USDC contract addresses for different chains (testnet addresses)
export const usdcContracts = {
    ETHEREUM: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
    POLYGON: "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23", // Mumbai USDC
    BSC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC Testnet USDC
    ARBITRUM: "0xfd064A18f3BF249cf1f87FC203E90D8f650f2d63", // Arbitrum Sepolia USDC
    OPTIMISM: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", // Optimism Sepolia USDC
    AVALANCHE: "0x5425890298aed601595a70AB815c96711a31Bc65", // Fuji USDC
    BASE: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    SOLANA: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Solana Devnet USDC
}

// USDC ABI for balance checking
export const usdcAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
]

export type SupportedChain = (typeof supportedChains)[number]
export type SupportedStablecoin = (typeof supportedStablecoins)[number]
export type SupportedEVMChain = (typeof supportedEVMChains)[number]
export type SupportedNonEVMChain = (typeof supportedNonEVMChains)[number]