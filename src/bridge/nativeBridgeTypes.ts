// We separate the types from the methods to avoid circular dependencies (transactions mainly)

import { ISignature } from "@/types";

// Supported chains and stablecoins
export const supportedChains = ["evm", "solana"] as const
export const supportedStablecoins = ["usdc"] as const

// Types for the operation
// NOTE: This will be sent from the client to the node
export type BridgeOperation = {
    // demoAddress: string
    // originChainType: SupportedChain
    // originChain: SupportedEVMChain | SupportedNonEVMChain
    // destinationChainType: SupportedChain
    // destinationChain: SupportedEVMChain | SupportedNonEVMChain
    // originAddress: string
    // destinationAddress: string
    // amount: string
    // token: SupportedStablecoin

    address: string;
    from: {
        chain: SupportedEVMChain | SupportedNonEVMChain
        subchain: string
        address: string
    }
    to: {
        chain: SupportedEVMChain | SupportedNonEVMChain
        subchain: string
        address: string
    }
    token: {
        type: SupportedStablecoin
        amount: string
    }

    // TODO: Ask Cris about these:
    // txHash: string
    // status: "empty" | "pending" | "completed" | "failed"
}

export interface TankData {
    type: "evm" | "solana",
    /**
     * Contract address of the tank
     */
    address: string,
    /**
     * Amount of tokens expected to be received
     */
    amountExpected: string,
}

export interface SolanaTankData extends TankData {
    type: "solana",
}

export interface EVMTankData extends TankData {
    type: "evm",
    abi: string[],
}

export type CompiledContent = {
    operation: BridgeOperation
    validUntil: number
    tankData: SolanaTankData | EVMTankData
}

// Types compiled from the node
// NOTE: This will be sent back from the node to the client
export type BridgeOperationCompiled = {
    content: CompiledContent
    signature: ISignature // Signed hash of the content
    rpcPublicKey: string // public key of the node that sent us back the operation
    /**
     * The transaction hash for the user's crosschain deposit to tank transaction.
     * This needs to be included when submitting the demos transaction.
     */
    txHash?: string
}

export type NativeBridgeTxPayload = {
    operation: BridgeOperationCompiled
    txHash: string
}

// Supported chains for EVM
export const supportedEVMChains = [
    "evm.eth",
    "evm.polygon",
    "evm.bsc",
    "evm.arbitrum",
    "evm.optimism",
    "evm.avalanche",
    "evm.base",
] as const

export const supportedNonEVMChains = ["solana"] as const

// USDC contract addresses for different chains (testnet addresses)
export const usdcContracts = {
    "evm.eth": {
        "sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "mainnet": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
    },
    "evm.polygon": {
        "mumbai": "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",
        "mainnet": "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23"
    },
    "evm.bsc": {
        "testnet": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "mainnet": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    },
    "evm.avalanche": {
        "fuji": "0x5425890298aed601595a70AB815c96711a31Bc65",
        "mainnet": "0x5425890298aed601595a70AB815c96711a31Bc65"
    },
    "evm.base": {
        "sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "mainnet": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    },
    "solana": {
        "devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        "mainnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    },
}

export const providerUrls = {
    "evm.eth": {
        "sepolia": "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "evm.polygon": {
        "mumbai": "https://polygon-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://polygon-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "evm.bsc": {
        "testnet": "https://bsc-dataseed.binance.org/",
        "mainnet": "https://bsc-dataseed.binance.org/"
    },
    "evm.arbitrum": {
        "sepolia": "https://arbitrum-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://arbitrum-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "evm.optimism": {
        "sepolia": "https://optimism-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://optimism-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "evm.avalanche": {
        "fuji": "https://avalanche-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://avalanche-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "evm.base": {
        "sepolia": "https://base-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
        "mainnet": "https://base-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"
    },
    "solana": {
        "devnet": "https://api.devnet-beta.solana.com",
        "mainnet": "https://api.mainnet-beta.solana.com"
    },
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