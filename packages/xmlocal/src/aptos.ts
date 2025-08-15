import {
    Network,
    Account,
} from "@aptos-labs/ts-sdk"

import {
    IDefaultChainLocal,
    APTOS as AptosCore,
} from "@kimcalc/xmcore"
import { XmTransactionResult, TransactionResponse } from "@kimcalc/xmcore"

/**
 * Aptos LocalSDK implementation for Node.js environments
 * Extends the core APTOS class with local-specific functionality
 */
export class APTOS extends AptosCore implements IDefaultChainLocal {
    constructor(rpc_url: string = "", network: Network = Network.DEVNET) {
        super(rpc_url, network)
    }

    /**
     * Broadcasts a signed transaction to the Aptos network
     * @param signed_tx The signed transaction (transaction hash as Uint8Array)
     * @returns Transaction response with result and hash
     */
    async sendTransaction(signed_tx: Uint8Array): Promise<TransactionResponse> {
        try {
            // Convert Uint8Array back to transaction hash string
            const transactionHash = new TextDecoder().decode(signed_tx)

            // Wait for the transaction to be confirmed
            const txResponse = await this.waitForTransaction(transactionHash)

            return {
                result: XmTransactionResult.success,
                hash: transactionHash,
                extra: { txResponse }
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error.toString(),
            }
        }
    }

    /**
     * Gets network and node information
     * @returns Network and ledger information
     */
    async getInfo(): Promise<any> {
        try {
            const [ledgerInfo, nodeInfo] = await Promise.all([
                this.aptos.getLedgerInfo(),
                this.aptos.getChainId()
            ])

            return {
                network: this.network,
                chainId: nodeInfo,
                ledgerVersion: ledgerInfo.ledger_version,
                ledgerTimestamp: ledgerInfo.ledger_timestamp,
                nodeRole: ledgerInfo.node_role,
                connected: this.connected
            }
        } catch (error) {
            throw new Error(`Failed to get network info: ${error}`)
        }
    }

    /**
     * Creates a new wallet (Account) with generated keys
     * @param password Not used in Aptos SDK, kept for interface compatibility
     * @returns The generated Account
     */
    async createWallet(password: string): Promise<Account> {
        try {
            // Generate new account using official SDK method
            const newAccount = Account.generate()

            // Store as the current wallet
            this.account = newAccount
            this.wallet = newAccount

            return newAccount
        } catch (error) {
            throw new Error(`Failed to create wallet: ${error}`)
        }
    }

    /**
     * Gets the private key of the connected wallet
     * @returns The private key as hex string
     */
    getPrivateKey(): string {
        if (!this.account) {
            throw new Error("No wallet connected")
        }

        // In Aptos SDK, Account doesn't expose privateKey directly
        // This would need to be stored separately when creating the account
        throw new Error("Private key access not supported through Account object")
    }

    /**
     * Fund account using faucet (only available on devnet/testnet)
     * @param address The address to fund
     * @param amount The amount to fund (in Octas)
     * @returns The transaction hash
     */
    async fundFromFaucet(address?: string, amount: number = 100_000_000): Promise<string> {
        try {
            const accountAddress = address || this.getAddress()

            if (this.network === Network.MAINNET) {
                throw new Error("Faucet not available on mainnet")
            }

            const response = await this.aptos.fundAccount({
                accountAddress,
                amount
            })

            return response.hash
        } catch (error) {
            throw new Error(`Failed to fund from faucet: ${error}`)
        }
    }

    /**
     * Submit a raw transaction (already signed)
     * @param rawTransaction The raw transaction bytes
     * @returns The transaction response
     */
    async submitRawTransaction(rawTransaction: Uint8Array): Promise<TransactionResponse> {
        try {
            // For Aptos, we expect the transaction to already be submitted
            // This method is for compatibility with the existing multichain interface
            const transactionHash = new TextDecoder().decode(rawTransaction)

            const txResponse = await this.waitForTransaction(transactionHash)

            return {
                result: XmTransactionResult.success,
                hash: transactionHash,
                extra: { txResponse }
            }
        } catch (error) {
            return {
                result: XmTransactionResult.error,
                error: error.toString(),
            }
        }
    }

    /**
     * Get transaction details by hash
     * @param transactionHash The transaction hash
     * @returns The transaction details
     */
    async getTransaction(transactionHash: string): Promise<any> {
        try {
            return await this.aptos.getTransactionByHash({
                transactionHash
            })
        } catch (error) {
            throw new Error(`Failed to get transaction: ${error}`)
        }
    }

    /**
     * Get account transactions
     * @param address The account address
     * @param start The start sequence number (optional)
     * @param limit The maximum number of transactions to return (optional)
     * @returns Array of transactions
     */
    async getAccountTransactions(
        address: string,
        start?: number,
        limit?: number
    ): Promise<any[]> {
        try {
            return await this.aptos.getAccountTransactions({
                accountAddress: address,
                options: {
                    offset: start,
                    limit
                }
            })
        } catch (error) {
            throw new Error(`Failed to get account transactions: ${error}`)
        }
    }

    /**
     * Estimate gas for a transaction
     * @param transaction The transaction to estimate
     * @returns Gas estimation
     */
    async estimateGas(transaction: any): Promise<any> {
        try {
            return await this.aptos.transaction.simulate.simple({
                signerPublicKey: this.account?.publicKey,
                transaction
            })
        } catch (error) {
            throw new Error(`Failed to estimate gas: ${error}`)
        }
    }
}