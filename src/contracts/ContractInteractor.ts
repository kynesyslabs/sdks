/**
 * Contract interaction functionality for Demos SDK
 */

import { Demos } from '../websdk/demosclass'
import { 
    ContractCallResult, 
    ContractCallOptions 
} from './types/ContractABI'
import { ContractCallPayload } from '../types/blockchain/TransactionSubtypes/ContractCallTransaction'
import { RPCRequest } from '../types/communication/rpc'
import { uint8ArrayToHex } from '../encryption/unifiedCrypto'
import * as skeletons from '../websdk/utils/skeletons'

export class ContractInteractor {
    constructor(private demos: Demos) {}

    /**
     * Call a smart contract method
     * @param contractAddress The contract address
     * @param method The method name to call
     * @param args Arguments for the method
     * @param options Call options
     * @returns Call result
     */
    async call<T = any>(
        contractAddress: string,
        method: string,
        args: any[] = [],
        options: ContractCallOptions = {}
    ): Promise<ContractCallResult<T>> {
        try {
            // For view/pure calls, use call RPC (no transaction needed)
            if (this.isViewCall(method, options)) {
                return await this.viewCall(contractAddress, method, args)
            }

            // For state-changing calls, send a transaction
            return await this.transactionCall(contractAddress, method, args, options)

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message || 'Contract call failed'
            }
        }
    }

    /**
     * Batch multiple contract calls
     */
    async batchCall(
        calls: Array<{
            contractAddress: string
            method: string
            args: any[]
            options?: ContractCallOptions
        }>
    ): Promise<ContractCallResult[]> {
        const results: ContractCallResult[] = []

        for (const call of calls) {
            const result = await this.call(
                call.contractAddress,
                call.method,
                call.args,
                call.options
            )
            results.push(result)
        }

        return results
    }

    /**
     * Read-only contract call (no transaction)
     */
    private async viewCall<T = any>(
        contractAddress: string,
        method: string,
        args: any[]
    ): Promise<ContractCallResult<T>> {
        const result = await this.sendRPC({
            method: 'contractCall',
            params: [{
                contractAddress,
                method,
                args,
                readOnly: true
            }]
        })

        if (result.result !== 200) {
            return {
                success: false,
                error: result.response?.error || 'View call failed'
            }
        }

        return {
            success: true,
            result: result.response.returnValue,
            gasUsed: result.response.gasUsed
        }
    }

    /**
     * State-changing contract call (sends transaction)
     */
    private async transactionCall<T = any>(
        contractAddress: string,
        method: string,
        args: any[],
        options: ContractCallOptions
    ): Promise<ContractCallResult<T>> {
        // Validate wallet connection
        if (!this.demos.walletConnected) {
            throw new Error('Wallet not connected. Please connect a wallet first.')
        }

        // Build the call transaction
        const tx = await this.buildCallTransaction(
            contractAddress,
            method,
            args,
            options
        )

        // Send the transaction
        const result = await this.sendRPC({
            method: 'sendTransaction',
            params: [tx]
        })

        if (result.result !== 200) {
            return {
                success: false,
                error: result.response?.error || 'Transaction failed'
            }
        }

        // Wait for confirmation if requested
        if (options.waitForConfirmation !== false) {
            const confirmation = await this.waitForTransaction(
                result.response.transactionHash,
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
                result: confirmation.returnValue as T,
                gasUsed: confirmation.gasUsed,
                events: confirmation.events,
                transactionHash: result.response.transactionHash,
                blockHeight: confirmation.blockHeight
            }
        }

        return {
            success: true,
            transactionHash: result.response.transactionHash
        }
    }

    /**
     * Build contract call transaction
     */
    private async buildCallTransaction(
        contractAddress: string,
        method: string,
        args: any[],
        options: ContractCallOptions
    ): Promise<any> {
        const { publicKey } = await this.demos.crypto.getIdentity('ed25519')
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = options.nonce ?? await this.demos.getAddressNonce(publicKeyHex)

        const payload: ContractCallPayload = {
            contractAddress,
            method,
            args
        }

        const tx = structuredClone(skeletons.transaction)
        tx.content.type = 'contractCall'
        tx.content.data = ['contractCall', payload]
        tx.content.nonce = nonce
        tx.content.from = publicKeyHex
        tx.content.timestamp = Date.now()
        tx.content.amount = Number(options.value || 0)

        // Sign the transaction
        return await this.signTransaction(tx)
    }

    /**
     * Check if a call is view/pure (read-only)
     */
    private isViewCall(method: string, options: ContractCallOptions): boolean {
        // Check if explicitly marked as view
        if (options.value && options.value > 0) {
            return false // Calls with value are never view
        }

        // Common view method patterns
        const viewPatterns = [
            /^get/i,
            /^is/i,
            /^has/i,
            /^check/i,
            /^view/i,
            /^read/i,
            /balance/i,
            /supply/i,
            /owner/i,
            /allowance/i
        ]

        return viewPatterns.some(pattern => pattern.test(method))
    }

    /**
     * Wait for transaction confirmation
     */
    private async waitForTransaction(
        txHash: string,
        confirmations: number
    ): Promise<any> {
        const maxAttempts = 30 // 30 seconds timeout
        let attempts = 0

        while (attempts < maxAttempts) {
            const result = await this.sendRPC({
                method: 'getTransactionReceipt',
                params: [txHash]
            })

            if (result.result === 200 && result.response) {
                const receipt = result.response
                if (receipt.confirmations >= confirmations) {
                    return {
                        success: true,
                        returnValue: receipt.returnValue,
                        gasUsed: receipt.gasUsed,
                        events: receipt.events,
                        blockHeight: receipt.blockHeight
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
        }

        return {
            success: false,
            error: 'Transaction confirmation timeout'
        }
    }

    /**
     * Helper to send RPC requests
     */
    private async sendRPC(request: RPCRequest): Promise<any> {
        // This will be implemented through the main Demos class
        return await (this.demos as any).rpcCall(request)
    }

    /**
     * Helper to sign transactions
     */
    private async signTransaction(tx: any): Promise<any> {
        // This will be implemented through the main Demos class
        return await this.demos.sign(tx)
    }
}