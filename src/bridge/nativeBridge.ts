import { Cryptography, Hashing } from "@/encryption"
import {
    BridgeOperation,
    BridgeOperationCompiled,
    SupportedChain,
    SupportedEVMChain,
    SupportedStablecoin,
    supportedEVMChains,
    SupportedNonEVMChain,
    supportedNonEVMChains,
    supportedStablecoins,
    usdcContracts,
    usdcAbi,
    providerUrls,
} from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { RPCRequest, RPCResponse } from "@/types"
import { Demos } from "@/websdk/demosclass"
import { ethers } from "ethers"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"

export class NativeBridge {
    private demos: Demos
    private MIN_BRIDGE_AMOUNT: number = 10 // $10 minimum
    private MAX_BRIDGE_AMOUNT: number = 10_000 // $10k maximum

    private constructor(demos: Demos) {
        this.demos = demos
    }

    /**
     * Checks if the bridge operation properties are supported.
     * 
     * @param operation The operation to validate
     */
    private async validateOperation(operation: BridgeOperation): Promise<void> {
        const validations: Array<Function> = [
            this.validateChainSupport,
            this.validateAmount,
            this.validateAddressFormats,
            this.validateFromBalance,
        ]

        for (const validation of validations) {
            // INFO: Execute validation functions.
            // If something goes wrong, the function will throw an error.
            await validation.call(this, operation)
        }
    }

    /**
     * Validates that the bridging chain and currency are supported.
     * 
     * @param operation The operation to validate
     * @throws Error if any chain is not supported
     */
    private validateChainSupport(operation: BridgeOperation): void {
        if (operation.from.chain === operation.to.chain) {
            throw new Error(
                `Invalid bridge operation: cannot bridge from ${operation.from.chain} to the same chain`
            )
        }

        if (!supportedStablecoins.includes(operation.token.type)) {
            throw new Error(`Unsupported token: ${operation.token.type}`)
        }

        const allSupportedChains = [...supportedEVMChains, ...supportedNonEVMChains]

        if (!allSupportedChains.includes(operation.from.chain as any)) {
            throw new Error(`Unsupported from chain: ${operation.from.chain}`)
        }

        if (!allSupportedChains.includes(operation.to.chain as any)) {
            throw new Error(`Unsupported to chain: ${operation.to.chain}`)
        }
    }

    /**
     * Validates that the amount is a valid positive number
     * and that it is within the acceptable limits
     * 
     * @param operation The operation to validate
     * @throws Error if amount is invalid
     */
    private validateAmount(operation: BridgeOperation): void {
        const amount = parseFloat(operation.token.amount)

        if (isNaN(amount)) {
            throw new Error(`Invalid amount: ${operation.token.amount} is not a valid number`)
        }

        if (amount <= this.MIN_BRIDGE_AMOUNT) {
            throw new Error(`Invalid amount: ${operation.token.amount} must be greater than ${this.MIN_BRIDGE_AMOUNT}`)
        }

        if (amount > this.MAX_BRIDGE_AMOUNT) {
            throw new Error(`Invalid amount: ${operation.token.amount} must be less than ${this.MAX_BRIDGE_AMOUNT}`)
        }
    }

    /**
     * Validates address formats for their respective chains
     * 
     * @param operation The operation to validate
     * @throws Error if addresses are improperly formatted
     */
    private validateAddressFormats(operation: BridgeOperation): void {
        this.validateAddressFormat(operation.from.address, operation.from.chain, 'from')
        this.validateAddressFormat(operation.to.address, operation.to.chain, 'to')
    }

    /**
     * Validates a single address format based on chain type
     * 
     * @param address The address to validate
     * @param chain The chain the address belongs to
     * @param addressType Description for error messages
     * @throws Error if address format is invalid
     */
    private validateAddressFormat(address: string, chain: SupportedEVMChain | SupportedNonEVMChain, addressType: string): void {
        if (supportedEVMChains.includes(chain as SupportedEVMChain)) {
            // EVM address validation (0x followed by 40 hex characters)
            const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/
            if (!evmAddressRegex.test(address)) {
                throw new Error(`Invalid ${addressType} address format for ${chain}: ${address}`)
            }
        } else if (chain === 'SOLANA') {
            // Solana address validation (Base58, typically 32-44 characters)
            const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
            if (!solanaAddressRegex.test(address)) {
                throw new Error(`Invalid ${addressType} address format for ${chain}: ${address}`)
            }
        }
    }

    /**
     * Validates that the from address has enough balance to bridge the amount
     * 
     * @param operation The operation to validate
     * @throws Error if the from address does not have enough balance
     */
    private async validateFromBalance(operation: BridgeOperation): Promise<void> {
        const requiredAmount = parseFloat(operation.token.amount)
        const fromChain = operation.from.chain
        const fromAddress = operation.from.address
        const token = operation.token.type

        let accountBalance = 0

        if (supportedEVMChains.includes(fromChain as SupportedEVMChain)) {
            // Handle EVM chains
            accountBalance = await this.getEVMTokenBalance(fromChain as SupportedEVMChain, fromAddress, token)
        } else if (fromChain === 'SOLANA') {
            // Handle Solana
            accountBalance = await this.getSolanaTokenBalance(fromAddress, token)
        } else {
            throw new Error(`Unsupported chain for balance validation: ${fromChain}`)
        }

        if (accountBalance < requiredAmount) {
            throw new Error(`Insufficient ${token} balance on ${fromChain}: has ${accountBalance}, needs ${requiredAmount}`)
        }
    }

    /**
     * Gets token balance for EVM chains
     * 
     * @param chain The EVM chain
     * @param contractAddress The token contract address
     * @param walletAddress The wallet address
     * @returns The token balance
     */
    private async getEVMTokenBalance(
        chain: SupportedEVMChain,
        contractAddress: string,
        walletAddress: string
    ): Promise<number> {
        try {
            const provider = new ethers.JsonRpcProvider(providerUrls[chain])
            const contract = new ethers.Contract(contractAddress, usdcAbi, provider)
            const balance = await contract.balanceOf(walletAddress)
            const decimals = await contract.decimals()
            return parseFloat(ethers.formatUnits(balance, decimals))
        } catch (error) {
            throw new Error(`Failed to get EVM token balance: ${error}`)
        }
    }

    /**
     * Gets token balance for Solana
     * 
     * @param walletAddress The wallet address
     * @param token The token type
     * @returns The token balance
     */
    private async getSolanaTokenBalance(walletAddress: string, token: SupportedStablecoin): Promise<number> {
        try {
            const connection = new Connection(providerUrls.solana)
            const walletPublicKey = new PublicKey(walletAddress)
            const usdcMint = new PublicKey(usdcContracts.solana) // USDC mint address

            // Get associated token account
            const associatedTokenAccount = await getAssociatedTokenAddress(
                usdcMint,
                walletPublicKey
            )

            // Get token account balance
            const balance = await connection.getTokenAccountBalance(associatedTokenAccount)
            return parseFloat(balance.value.uiAmountString || '0')
        } catch (error) {
            throw new Error(`Failed to get Solana token balance: ${error}`)
        }
    }

    /**
     * Validates and confirms the bridge operation
     * 
     * @param operation The operation to confirm
     * @returns The compiled operation
     */
    async confirm(operation: BridgeOperation): Promise<BridgeOperationCompiled> {
        await this.validateOperation(operation)
        return "" as any
    }

    /**
     * Broadcasts the compiled bridge operation back to the RPC as a transaction
     * 
     * @param operation The operation to broadcast
     * @returns Transaction receipt
     */
    broadcast(operation: BridgeOperationCompiled): RPCResponse {
        return "" as any
    }
}

export const methods = {
    /**
     * Validates the chain
     * @param chain
     * @param chainType
     * @param isOrigin (useful for error messages)
     */
    validateChain(
        chain: string,
        chainType: string,
        isOrigin: boolean,
    ) {
        const chainTypeStr = isOrigin ? "origin" : "destination"
        if (chainType === "EVM") {
            if (!supportedEVMChains.includes(chain as SupportedEVMChain)) {
                throw new Error(
                    `Invalid ${chainTypeStr} chain: ${chain} is not a supported EVM`,
                )
            }
        } else {
            if (
                !supportedNonEVMChains.includes(
                    chain as SupportedNonEVMChain,
                )
            ) {
                throw new Error(
                    `Invalid ${chainTypeStr} chain: ${chain} is not a supported chain`,
                )
            }
        }
    },
    /**
     * Generates a new operation, ready to be sent to the node as a RPCRequest
     * TODO Implement the params
     * REVIEW Should we use the identity somehow or we keep using the private key?
     */
    generateOperation(
        privateKey: string,
        publicKey: string,
        originChainType: SupportedChain,
        originChain: SupportedEVMChain | SupportedNonEVMChain,
        destinationChainType: SupportedChain,
        destinationChain: SupportedEVMChain | SupportedNonEVMChain,
        originAddress: string,
        destinationAddress: string,
        amount: string,
        token: SupportedStablecoin,
    ): RPCRequest {
        // Ensuring the chains are valid: throw an error if not
        this.validateChain(originChain, originChainType, true)
        this.validateChain(destinationChain, destinationChainType, false)
        // Defining the operation
        const operation: BridgeOperation = {
            demoAddress: publicKey,
            originChainType: originChainType,
            originChain: originChain,
            destinationChainType: destinationChainType,
            destinationChain: destinationChain,
            originAddress: originAddress,
            destinationAddress: destinationAddress,
            amount: amount,
            token: token,
            txHash: "",
            status: "empty",
        }
        // REVIEW Sign the operation
        let opHash = Hashing.sha256(JSON.stringify(operation))
        let signature = Cryptography.sign(opHash, privateKey)
        let hexSignature = new TextDecoder().decode(signature)
        let nodeCallPayload: RPCRequest = {
            method: "nativeBridge",
            params: [operation, hexSignature],
        }
        return nodeCallPayload
    },

    /**
     *
     * @param compiled operation
     * @param signature
     * @param rpc
     * @returns
     */
    generateOperationTx(compiled: BridgeOperationCompiled): Transaction {
        // TODO Implement the transaction once we have the compiled operation
        // Preparing the known values for the transaction
        const tx: Transaction = {
            content: {
                type: "nativeBridge",
                data: ["nativeBridge", compiled],
                from: "", // TODO Implement from using the identity
                to: "", // TODO Same as from
                from_ed25519_address: "",
                amount: 0,
                gcr_edits: [],
                nonce: 0,
                timestamp: Date.now(),
                transaction_fee: { // TODO Compile with the BridgeOperationCompiled object content
                    network_fee: 0,
                    rpc_fee: 0,
                    additional_fee: 0,
                },
            },
            signature: {
                type: "ed25519",
                data: "",
            },
            hash: "",
            status: "empty",
            blockNumber: 0,
            ed25519_signature: ""
        }
        // TODO Hash and sign the transaction
        return tx
    },
}
