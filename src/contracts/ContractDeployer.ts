/**
 * Contract deployment functionality for Demos SDK
 */

import { Demos } from '../websdk/demosclass'
import { 
    ContractDeploymentResult, 
    ContractDeployOptions,
    ContractMetadata,
    ContractCallOptions 
} from './types/ContractABI'
import { ContractInstance } from './ContractInstance'
import { ContractDeployPayload } from '../types/blockchain/TransactionSubtypes/ContractDeployTransaction'
import { RPCRequest } from '../types/communication/rpc'
import { uint8ArrayToHex } from '../encryption/unifiedCrypto'
import * as skeletons from '../websdk/utils/skeletons'

export class ContractDeployer {
    constructor(private demos: Demos) {}

    /**
     * Deploy a new smart contract
     * @param source TypeScript source code of the contract
     * @param constructorArgs Arguments for the contract constructor
     * @param options Deployment options
     * @returns Deployment result with contract address
     */
    async deploy(
        source: string,
        constructorArgs: any[] = [],
        options: ContractDeployOptions = {}
    ): Promise<ContractDeploymentResult> {
        try {
            // Validate wallet connection
            if (!this.demos.walletConnected) {
                throw new Error('Wallet not connected. Please connect a wallet first.')
            }

            // Validate source code
            if (options.validateSource !== false) {
                this.validateSourceCode(source)
            }

            // Prepare deployment payload
            const deployPayload: ContractDeployPayload = {
                source,
                constructorArgs,
                metadata: options.metadata
            }

            // Build the deployment transaction
            const tx = await this.buildDeployTransaction(deployPayload, options)

            // Send the transaction
            const rpcResult = await this.demos.rpcCall({
                method: 'sendTransaction',
                params: [tx]
            } as RPCRequest)

            if (rpcResult.result !== 200) {
                return {
                    success: false,
                    error: rpcResult.response?.error || 'Deployment failed'
                }
            }

            // Wait for confirmation if requested
            if (options.waitForConfirmation !== false) {
                const confirmation = await this.waitForDeployment(
                    rpcResult.response.transactionHash,
                    options.confirmations || 1
                )

                if (!confirmation.success) {
                    return {
                        success: false,
                        error: confirmation.error
                    }
                }

                return {
                    success: true,
                    contractAddress: confirmation.contractAddress,
                    deploymentTx: rpcResult.response.transactionHash,
                    gasUsed: confirmation.gasUsed,
                    blockHeight: confirmation.blockHeight
                }
            }

            return {
                success: true,
                deploymentTx: rpcResult.response.transactionHash,
                contractAddress: rpcResult.response.contractAddress
            }

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message || 'Contract deployment failed'
            }
        }
    }

    /**
     * Deploy a contract and return an instance wrapper
     */
    async deployAndWrap<T = any>(
        source: string,
        constructorArgs: any[] = [],
        options: ContractDeployOptions = {}
    ): Promise<ContractInstance<T>> {
        const result = await this.deploy(source, constructorArgs, options)
        
        if (!result.success || !result.contractAddress) {
            throw new Error(result.error || 'Deployment failed')
        }

        return new ContractInstance<T>(
            this.demos,
            result.contractAddress,
            options.metadata?.abi
        )
    }

    /**
     * Validate contract source code
     */
    private validateSourceCode(source: string): void {
        // Check for basic contract structure
        if (!source.includes('DemosContract')) {
            throw new Error('Contract must extend DemosContract')
        }

        // Check for banned APIs
        const bannedAPIs = [
            'eval', 'Function', 'setTimeout', 'setInterval',
            'XMLHttpRequest', 'fetch', 'WebSocket', 'Worker'
        ]
        
        for (const api of bannedAPIs) {
            if (source.includes(api)) {
                throw new Error(`Banned API detected: ${api}`)
            }
        }

        // Check size limit (256KB)
        const sizeInBytes = new TextEncoder().encode(source).length
        if (sizeInBytes > 256 * 1024) {
            throw new Error(`Contract too large: ${sizeInBytes} bytes (max 256KB)`)
        }
    }

    /**
     * Build deployment transaction
     */
    private async buildDeployTransaction(
        payload: ContractDeployPayload,
        options: ContractCallOptions
    ): Promise<any> {
        const { publicKey } = await this.demos.crypto.getIdentity('ed25519')
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await this.demos.getAddressNonce(publicKeyHex)

        const tx = structuredClone(skeletons.transaction)
        tx.content.type = 'contractDeploy'
        tx.content.data = ['contractDeploy', payload]
        tx.content.nonce = options.nonce || nonce
        tx.content.from = publicKeyHex
        tx.content.timestamp = Date.now()
        tx.content.amount = Number(options.value || 0)

        // Sign the transaction
        return await this.demos.sign(tx)
    }

    /**
     * Wait for contract deployment confirmation
     */
    private async waitForDeployment(
        txHash: string, 
        confirmations: number
    ): Promise<any> {
        const maxAttempts = 30 // 30 seconds timeout
        let attempts = 0

        while (attempts < maxAttempts) {
            const result = await this.demos.rpcCall({
                method: 'getTransactionReceipt',
                params: [txHash]
            } as RPCRequest)

            if (result.result === 200 && result.response) {
                const receipt = result.response
                if (receipt.confirmations >= confirmations) {
                    return {
                        success: true,
                        contractAddress: receipt.contractAddress,
                        gasUsed: receipt.gasUsed,
                        blockHeight: receipt.blockHeight
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
        }

        return {
            success: false,
            error: 'Deployment confirmation timeout'
        }
    }
}