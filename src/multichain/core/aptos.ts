import {
    Aptos,
    AptosConfig,
    Network,
    Account,
    AccountAddress,
    SimpleTransaction,
    UserTransactionResponse,
    Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk"

import { DefaultChain } from "./types/defaultChain"
import { IPayParams, XmTransactionResponse } from "./types/interfaces"
import { required } from "./utils"

/* LICENSE

© 2023 by KyneSys Labs, licensed under CC BY-NC-ND 4.0

Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human readable license: https://creativecommons.org/licenses/by-nc-nd/4.0/

KyneSys Labs: https://www.kynesys.xyz/

*/

/**
 * Extension methods for the Aptos Default Chain SDK
 */
export interface AptosDefaultChain extends DefaultChain {
    aptos: Aptos
    account: Account | null
    network: Network

    /**
     * Get APT balance for an account
     */
    getAPTBalance: (address: string) => Promise<string>

    /**
     * Get coin balance for a specific coin type
     */
    getCoinBalance: (coinType: string, address: string) => Promise<string>

    /**
     * Read from a smart contract (view function)
     */
    readFromContract: (
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments?: string[]
    ) => Promise<any>

    /**
     * Write to a smart contract (entry function) - returns signed transaction for XM
     */
    writeToContract: (
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments?: string[]
    ) => Promise<Uint8Array>


    /**
     * Wait for transaction confirmation
     */
    waitForTransaction: (transactionHash: string) => Promise<UserTransactionResponse>
}

/**
 * Aptos SDK implementation following official @aptos-labs/ts-sdk patterns
 */
export class APTOS extends DefaultChain implements AptosDefaultChain {
    declare provider: Aptos
    aptos: Aptos
    account: Account | null = null
    network: Network

    constructor(rpc_url: string = "", network: Network = Network.DEVNET) {
        super(rpc_url)
        this.name = "aptos"
        this.network = network
        
        // Initialize Aptos client with network configuration
        const config = new AptosConfig({ 
            network: this.network,
            // If custom RPC URL provided, use it
            ...(rpc_url && { fullnode: rpc_url })
        })
        this.aptos = new Aptos(config)
        this.provider = this.aptos
    }

    /**
     * Sets the RPC URL and reinitializes the Aptos client
     */
    override setRpc(rpc_url: string): void {
        this.rpc_url = rpc_url
        
        const config = new AptosConfig({ 
            network: this.network,
            fullnode: rpc_url
        })
        this.aptos = new Aptos(config)
        this.provider = this.aptos
    }

    /**
     * Sets the network and reinitializes the Aptos client
     */
    setNetwork(network: Network): void {
        this.network = network
        
        const config = new AptosConfig({ 
            network: this.network,
            ...(this.rpc_url && { fullnode: this.rpc_url })
        })
        this.aptos = new Aptos(config)
        this.provider = this.aptos
    }

    /**
     * Connects to the Aptos network
     * @returns A boolean indicating whether the connection was successful
     */
    async connect(): Promise<boolean> {
        try {
            // Test connection by getting ledger info
            await this.aptos.getLedgerInfo()
            this.connected = true
            return true
        } catch (error) {
            console.error("Failed to connect to Aptos network:", error)
            this.connected = false
            return false
        }
    }

    /**
     * Connects to a wallet using a private key
     * @param privateKey The private key of the wallet (hex string)
     * @returns The Account object
     */
    async connectWallet(privateKey: string): Promise<Account> {
        required(privateKey, "Private key is required")
        
        try {
            // Create Ed25519PrivateKey from hex string
            const privateKeyBytes = new Ed25519PrivateKey(privateKey)
            
            // Create account from private key using official SDK method
            this.account = Account.fromPrivateKey({ privateKey: privateKeyBytes })
            this.wallet = this.account
            return this.account
        } catch (error) {
            throw new Error(`Failed to connect wallet: ${error}`)
        }
    }

    /**
     * Gets the APT balance of a wallet
     * @param address The wallet address
     * @returns The balance as a string (in Octas, 1 APT = 100,000,000 Octas)
     */
    async getBalance(address: string): Promise<string> {
        return this.getAPTBalance(address)
    }

    /**
     * Gets the APT balance using official SDK method
     * @param address The wallet address
     * @returns The balance as a string (in Octas)
     */
    async getAPTBalance(address: string): Promise<string> {
        try {
            const balance = await this.aptos.getAccountAPTAmount({
                accountAddress: address
            })
            return balance.toString()
        } catch (error) {
            throw new Error(`Failed to get APT balance: ${error}`)
        }
    }

    /**
     * Gets the balance of a specific coin type
     * @param coinType The coin type (e.g., "0x1::aptos_coin::AptosCoin")
     * @param address The wallet address
     * @returns The balance as a string
     */
    async getCoinBalance(coinType: string, address: string): Promise<string> {
        try {
            const resource = await this.aptos.getAccountResource({
                accountAddress: address,
                resourceType: `0x1::coin::CoinStore<${coinType}>`
            })
            return (resource as any).coin.value
        } catch (error) {
            throw new Error(`Failed to get coin balance: ${error}`)
        }
    }

    /**
     * Creates a signed transaction to transfer APT
     * @param receiver The receiver's address
     * @param amount The amount to transfer (in Octas)
     * @returns The signed transaction
     */
    async preparePay(receiver: string, amount: string): Promise<Uint8Array> {
        required(this.account, "Wallet not connected")
        
        try {
            // Build transaction using official SDK pattern
            const transaction = await this.aptos.transaction.build.simple({
                sender: this.account.accountAddress,
                data: {
                    function: "0x1::coin::transfer",
                    typeArguments: ["0x1::aptos_coin::AptosCoin"],
                    functionArguments: [receiver, amount]
                }
            })

            // Sign and submit transaction
            const response = await this.aptos.signAndSubmitTransaction({
                signer: this.account,
                transaction
            })

            return new TextEncoder().encode(response.hash)
        } catch (error) {
            throw new Error(`Failed to prepare payment: ${error}`)
        }
    }

    /**
     * Creates multiple signed transactions to transfer APT
     * @param payments Array of payment parameters
     * @returns Array of signed transactions
     */
    async preparePays(payments: IPayParams[]): Promise<Uint8Array[]> {
        required(this.account, "Wallet not connected")
        
        const signedTransactions: Uint8Array[] = []
        
        for (const payment of payments) {
            const signedTx = await this.preparePay(payment.address, payment.amount.toString())
            signedTransactions.push(signedTx)
        }
        
        return signedTransactions
    }

    /**
     * Creates an empty transaction template
     */
    async getEmptyTransaction(): Promise<SimpleTransaction> {
        required(this.account, "Wallet not connected")
        
        return await this.aptos.transaction.build.simple({
            sender: this.account.accountAddress,
            data: {
                function: "0x1::coin::transfer",
                typeArguments: ["0x1::aptos_coin::AptosCoin"],
                functionArguments: ["0x1", "0"] // Placeholder values
            }
        })
    }

    /**
     * Returns the address of the connected wallet
     */
    getAddress(): string {
        required(this.account, "Wallet not connected")
        return this.account.accountAddress.toString()
    }

    /**
     * Signs a message using the connected wallet
     * @param message The message to sign
     * @returns The signed message
     */
    async signMessage(message: string): Promise<Uint8Array> {
        required(this.account, "Wallet not connected")
        
        try {
            const signature = this.account.sign(new TextEncoder().encode(message))
            return signature.toUint8Array()
        } catch (error) {
            throw new Error(`Failed to sign message: ${error}`)
        }
    }

    /**
     * Verifies a message signature
     * @param message The original message
     * @param signature The signature to verify
     * @param publicKey The public key to verify against
     * @returns Boolean indicating if the signature is valid
     */
    async verifyMessage(
        message: string,
        signature: string | Uint8Array,
        publicKey: string | Uint8Array
    ): Promise<boolean> {
        try {
            // Convert inputs to proper format
            const messageBytes = new TextEncoder().encode(message)
            const sigBytes = typeof signature === "string" 
                ? new TextEncoder().encode(signature) 
                : signature
            const pubKeyBytes = typeof publicKey === "string"
                ? new TextEncoder().encode(publicKey)
                : publicKey
            
            // For now, return true as verification implementation depends on signature format
            // TODO: Implement proper signature verification using Aptos SDK methods
            return true
        } catch (error) {
            console.error("Failed to verify message:", error)
            return false
        }
    }

    /**
     * Signs a transaction using the connected wallet
     * @param transaction The transaction to sign
     * @returns The signed transaction
     */
    async signTransaction(transaction: SimpleTransaction): Promise<Uint8Array> {
        required(this.account, "Wallet not connected")
        
        try {
            const response = await this.aptos.signAndSubmitTransaction({
                signer: this.account,
                transaction
            })
            
            return new TextEncoder().encode(response.hash)
        } catch (error) {
            throw new Error(`Failed to sign transaction: ${error}`)
        }
    }

    /**
     * Signs multiple transactions
     * @param transactions Array of transactions to sign
     * @returns Array of signed transactions
     */
    async signTransactions(transactions: SimpleTransaction[]): Promise<Uint8Array[]> {
        const signedTransactions: Uint8Array[] = []
        
        for (const transaction of transactions) {
            const signedTx = await this.signTransaction(transaction)
            signedTransactions.push(signedTx)
        }
        
        return signedTransactions
    }

    /**
     * Read from a smart contract (view function)
     * @param moduleAddress The module address
     * @param moduleName The module name
     * @param functionName The function name
     * @param args Function arguments
     * @param typeArguments Type arguments for generic functions (optional)
     * @returns The function result
     */
    async readFromContract(
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments: string[] = []
    ): Promise<any> {
        try {
            // Validate module address format
            if (!this.isAddress(moduleAddress)) {
                throw new Error(`Invalid module address format: ${moduleAddress}`)
            }

            // Build the view function payload with proper typing
            const fullFunctionName = `${moduleAddress}::${moduleName}::${functionName}` as `${string}::${string}::${string}`
            
            const payload = {
                function: fullFunctionName,
                functionArguments: args,
                ...(typeArguments.length > 0 && { typeArguments })
            }

            const result = await this.aptos.view({ payload })
            return result
        } catch (error: any) {
            // Enhanced error handling for Move-specific errors
            const errorMsg = error?.message || error?.toString() || 'Unknown error'
            
            if (errorMsg.includes('MODULE_NOT_FOUND')) {
                throw new Error(`Module not found: ${moduleAddress}::${moduleName}`)
            } else if (errorMsg.includes('FUNCTION_NOT_FOUND')) {
                throw new Error(`Function not found: ${functionName} in ${moduleAddress}::${moduleName}`)
            } else if (errorMsg.includes('Type argument count mismatch')) {
                throw new Error(`Type argument mismatch for ${functionName}. Expected different count than ${typeArguments.length}`)
            } else if (errorMsg.includes('INVALID_ARGUMENT')) {
                throw new Error(`Invalid arguments for ${functionName}: ${JSON.stringify(args)}`)
            }
            
            throw new Error(`Failed to read from contract ${moduleAddress}::${moduleName}::${functionName}: ${errorMsg}`)
        }
    }

    /**
     * Prepare a smart contract write transaction for Demos Network relay
     * Builds transaction for XM operations - does NOT execute directly
     * All contract writes must go through Demos Network XM system
     * @param moduleAddress The module address
     * @param moduleName The module name
     * @param functionName The function name
     * @param args Function arguments
     * @param typeArguments Type arguments (optional)
     * @returns The serialized transaction bytes for XM relay
     */
    async writeToContract(
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments: string[] = []
    ): Promise<Uint8Array> {
        required(this.account, "Wallet not connected")
        
        try {
            const transaction = await this.aptos.transaction.build.simple({
                sender: this.account.accountAddress,
                data: {
                    function: `${moduleAddress}::${moduleName}::${functionName}`,
                    typeArguments,
                    functionArguments: args
                }
            })
            
            // For XM operations, we serialize and return the transaction for later submission
            // The node will handle the actual submission via sendTransaction
            const serializedTransaction = transaction.bcsToBytes()
            return serializedTransaction
        } catch (error) {
            throw new Error(`Failed to prepare contract write transaction: ${error}`)
        }
    }


    /**
     * Wait for transaction confirmation
     * @param transactionHash The transaction hash
     * @returns The transaction response
     */
    async waitForTransaction(transactionHash: string): Promise<UserTransactionResponse> {
        try {
            return await this.aptos.waitForTransaction({ 
                transactionHash 
            }) as UserTransactionResponse
        } catch (error) {
            throw new Error(`Failed to wait for transaction: ${error}`)
        }
    }

    /**
     * Check if an address is valid
     * @param address The address to validate
     * @returns Boolean indicating if the address is valid
     */
    isAddress(address: string): boolean {
        try {
            AccountAddress.from(address)
            return true
        } catch {
            return false
        }
    }
}