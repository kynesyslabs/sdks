// We separate the types from the methods to avoid circular dependencies (transactions mainly)

import { ISignature } from "@/types"

// Supported chains and stablecoins
// export const supportedChains = ["evm", "solana"] as const
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

    address: string
    from: {
        chain: SupportedChain
        address: string
    }
    to: {
        chain: SupportedChain
        address: string
    }
    token: {
        amount: string
        name: SupportedStablecoin
        /**
         * The ERC20 token address (will be filled by NativeBridge.validate)
         */
        address?: string
    }
}

export interface TankData {
    type: "evm" | "solana"
    /**
     * Contract address of the tank
     */
    tankAddress: string
    /**
     * Amount of tokens to deposit to the tank
     */
    amountToDeposit: bigint

    /**
     * Breakdown of the amount to deposit
     */
    breakdown: {
        /**
         * Amount you'll receive on the destination chain
         */
        bridgeAmount: string
        /**
         * Bridge fee
         */
        bridgeFee: string
    }

    /**
     * Bridge fee in basis points
     */
    feeBps: number
}

export interface SolanaTankData extends TankData {
    type: "solana"
}

export interface EVMTankData extends TankData {
    type: "evm"
    abi: string
}

export type CompiledContent = {
    operation: BridgeOperation
    validUntil: number
    tankData: SolanaTankData | EVMTankData
    bridgeId: string
}

// Types compiled from the node
// NOTE: This will be sent back from the node to the client
export type BridgeOperationCompiled = {
    content: CompiledContent
    signature: ISignature // Signed hash of the content
    rpcPublicKey: string // public key of the node that sent us back the operation
}

export type NativeBridgeTxPayload = {
    operation: BridgeOperationCompiled
    /**
     * The transaction hash for the user's crosschain deposit to tank transaction.
     * This needs to be included when submitting the demos transaction.
     */
    txHash: string
}

// Supported chains for EVM
// export const supportedEVMChains = [
//     "evm.eth",
//     "evm.polygon",
//     "evm.bsc",
//     "evm.arbitrum",
//     "evm.optimism",
//     "evm.avalanche",
//     "evm.base",
// ] as const

export const supportedNonEVMChains = ["solana"] as const

// USDC contract addresses for different chains (testnet addresses)
export const StableCoinContracts = {
    usdc: {
        "evm.eth.sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "evm.eth.mainnet": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "evm.polygon.amoy": "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",
        "evm.polygon.mainnet": "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",
        "evm.bsc.testnet": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "evm.bsc.mainnet": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        "evm.avalanche.fuji": "0x5425890298aed601595a70AB815c96711a31Bc65",
        "evm.avalanche.mainnet": "0x5425890298aed601595a70AB815c96711a31Bc65",
        "evm.base.sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "evm.base.mainnet": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "solana.devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        "solana.mainnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
}

export const supportedChains = Object.keys(StableCoinContracts["usdc"])

export const providerUrls = {
    "evm.eth.sepolia": "https://ethereum-sepolia-rpc.publicnode.com",
    "evm.eth.mainnet": "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.polygon.mumbai":
        "https://polygon-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.polygon.mainnet":
        "https://polygon-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.bsc.testnet": "https://bsc-dataseed.binance.org/",
    "evm.bsc.mainnet": "https://bsc-dataseed.binance.org/",
    "evm.arbitrum.sepolia":
        "https://arbitrum-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.arbitrum.mainnet":
        "https://arbitrum-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.optimism.sepolia":
        "https://optimism-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.optimism.mainnet":
        "https://optimism-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.avalanche.fuji":
        "https://avalanche-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.avalanche.mainnet":
        "https://avalanche-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.base.sepolia":
        "https://base-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "evm.base.mainnet":
        "https://base-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID",
    "solana.devnet": "https://api.devnet-beta.solana.com",
    "solana.mainnet": "https://api.mainnet-beta.solana.com",
}

// USDC ABI for balance checking
export const usdcAbi = JSON.stringify([
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function version() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
])

export const tokenAddresses = {
    usdc: {
        "evm.eth.sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "evm.eth.mainnet": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
}

export const abis = {
    usdc: usdcAbi,
}

export type SupportedChain = (typeof supportedChains)[number]
export type SupportedStablecoin = (typeof supportedStablecoins)[number]
// export type SupportedEVMChain = (typeof supportedChains)[number]
// export type SupportedNonEVMChain = (typeof supportedNonEVMChains)[number]
