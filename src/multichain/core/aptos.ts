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
import { generateSignedTransaction } from "@aptos-labs/ts-sdk";

import { DefaultChain } from "./types/defaultChain"
import { IPayParams, XmTransactionResponse } from "./types/interfaces"
import { required } from "./utils"
import { XMScript } from "@/types"
import { hexToUint8Array, uint8ArrayToHex } from "@/encryption";
import * as forge from "node-forge";

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
    wallet: Account | null

    /**
     * Gets the public key of the connected wallet
     * @returns The public key as hex string
     */
    getPublicKey: () => string

    /**
     * Get APT balance for an account (default: XM operation)
     */
    getAPTBalance: (address: string) => Promise<any>

    /**
     * Get APT balance directly from Aptos RPC (bypasses Demos Network)
     */
    getAPTBalanceDirect: (address: string) => Promise<string>

    /**
     * Get coin balance for a specific coin type (default: XM operation)
     */
    getCoinBalance: (coinType: string, address: string) => Promise<any>

    /**
     * Get coin balance directly from Aptos RPC (bypasses Demos Network)
     */
    getCoinBalanceDirect: (coinType: string, address: string) => Promise<string>

    /**
     * Read from a smart contract (default: XM operation)
     */
    readFromContract: (
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments?: string[]
    ) => Promise<XMScript>

    /**
     * Read from a smart contract directly (bypasses Demos Network)
     */
    readFromContractDirect: (
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
    ) => Promise<XMScript>


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
     * 
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
     * Gets the APT balance directly from Aptos RPC given an address
     * 
     * The other get balance methods use this method to get the balance
     * 
     * @param address The wallet address
     * @returns The balance as a string (in Octas)
     */
    async getAPTBalanceDirect(address: string): Promise<string> {
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
     * Gets the balance of a specific coin type directly from Aptos RPC given a coin type and address
     * 
     * The other get balance methods use this method to get the balance
     * 
     * @param coinType The coin type (e.g., "0x1::aptos_coin::AptosCoin")
     * @param address The wallet address
     * @returns The balance as a string
     */
    async getCoinBalanceDirect(coinType: string, address: string): Promise<string> {
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
     * Gets the APT balance from the Aptos network given an address
     * 
     * @param address The wallet address
     * @returns XM operation object for Demos Network relay
     */
    async getBalance(address: string): Promise<any> {
        return await this.getAPTBalanceDirect(address)

        const subchain = this.network === Network.MAINNET ? "mainnet" :
            this.network === Network.TESTNET ? "testnet" : "devnet"
        return {
            chain: "aptos",
            subchain: subchain,
            task: {
                type: "balance_query",
                params: {
                    address: address,
                    coinType: "0x1::aptos_coin::AptosCoin"
                }
            }
        }
    }

    /**
     * Gets the APT balance from the Aptos network given an address
     * 
     * @param address The wallet address
     * @returns XM operation object for Demos Network relay
     */
    async getAPTBalance(address: string): Promise<any> {
        return await this.getAPTBalanceDirect(address)

        const subchain = this.network === Network.MAINNET ? "mainnet" :
            this.network === Network.TESTNET ? "testnet" : "devnet"
        return {
            chain: "aptos",
            subchain: subchain,
            task: {
                type: "balance_query",
                params: {
                    address: address,
                    coinType: "0x1::aptos_coin::AptosCoin"
                }
            }
        }
    }

    /**
     * Gets a coin balance from the Aptos network given a coin type and address
     * 
     * @param coinType The coin type (e.g., "0x1::aptos_coin::AptosCoin")
     * @param address The wallet address
     * 
     * @returns XM operation object for Demos Network relay
     */
    async getCoinBalance(coinType: string, address: string): Promise<any> {
        return this.getCoinBalanceDirect(coinType, address)

        const subchain = this.network === Network.MAINNET ? "mainnet" :
            this.network === Network.TESTNET ? "testnet" : "devnet"

        return {
            chain: "aptos",
            subchain: subchain,
            task: {
                type: "balance_query",
                params: {
                    address: address,
                    coinType: coinType
                }
            }
        }
    }

    /**
     * Creates a signed transaction to transfer APT
     * 
     * @param receiver The receiver's address
     * @param amount The amount to transfer (in Octas)
     * 
     * @returns The signed Aptos transaction as hex string
     */
    async preparePay(receiver: string, amount: string): Promise<string> {
        required(this.account, "[Core] Wallet not connected")

        try {
            // INFO: Construct the transaction
            const transaction = await this.aptos.transaction.build.simple({
                sender: this.account.accountAddress,
                data: {
                    function: "0x1::coin::transfer",
                    typeArguments: ["0x1::aptos_coin::AptosCoin"],
                    functionArguments: [receiver, amount]
                }
            })

            // INFO: Sign the transaction
            return this.signTransaction(transaction)
        } catch (error) {
            throw new Error(`Failed to prepare payment: ${error}`)
        }
    }

    /**
     * Creates multiple signed transactions to transfer APT
     * 
     * @param payments Array of payment parameters
     * 
     * @returns Array of signed Aptos transactions as hex strings
     */
    async preparePays(payments: IPayParams[]): Promise<string[]> {
        required(this.account, "Wallet not connected")

        const signedTransactions: string[] = []

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
     * Gets the public key of the connected wallet
     * 
     * @returns The public key as hex string
     */
    getPublicKey(): string {
        if (!this.account) {
            throw new Error("No wallet connected")
        }

        return this.account.publicKey.toString()
    }

    /**
     * Returns the address of the connected wallet
     * 
     * @returns The wallet address as hex string
     */
    getAddress(): string {
        required(this.account, "Wallet not connected")
        return this.account.accountAddress.toString()
    }

    /**
     * Signs a message using the connected wallet
     * @param message The message to sign
     * 
     * @returns The signed message as hex string
     */
    async signMessage(message: string): Promise<string> {
        required(this.account, "Wallet not connected")

        try {
            const signature = this.account.sign(new TextEncoder().encode(message))
            return uint8ArrayToHex(signature.toUint8Array())
        } catch (error) {
            throw new Error(`Failed to sign message: ${error}`)
        }
    }

    /**
     * Verifies a message signature
     * 
     * @param message The original message
     * @param signature The signature to verify
     * @param publicKey The public key to verify against
     * 
     * @returns Boolean indicating if the signature is valid
     */
    async verifyMessage(
        message: string,
        signature: string,
        publicKey: string
    ): Promise<boolean> {
        try {
            // Convert hex strings to Uint8Arrays
            const signatureBytes = hexToUint8Array(signature)
            const publicKeyBytes = hexToUint8Array(publicKey)

            // Validate input sizes
            if (signatureBytes.length !== 64) {
                throw new Error("Invalid signature length. Ed25519 signatures must be 64 bytes.")
            }
            if (publicKeyBytes.length !== 32) {
                throw new Error("Invalid public key length. Ed25519 public keys must be 32 bytes.")
            }

            // Use node-forge for Ed25519 signature verification
            const isValid = forge.pki.ed25519.verify({
                message: message,
                encoding: "utf8",
                signature: signatureBytes,
                publicKey: publicKeyBytes
            })

            return isValid
        } catch (error) {
            console.error("Failed to verify message:", error)
            return false
        }
    }

    /**
     * Signs a transaction using the connected wallet
     * @param transaction The transaction to sign
     * 
     * @returns The signed Aptos transaction as hex string
     */
    async signTransaction(transaction: SimpleTransaction): Promise<string> {
        required(this.account, "Wallet not connected")

        try {
            const senderAuthenticator = this.aptos.sign({
                signer: this.account,
                transaction
            })

            const bufferTx = generateSignedTransaction({
                transaction,
                senderAuthenticator
            })

            return uint8ArrayToHex(bufferTx)
        } catch (error) {
            throw new Error(`Failed to sign transaction: ${error}`)
        }
    }

    /**
     * Signs multiple transactions
     * @param transactions Array of transactions to sign
     * 
     * @returns Array of signed Aptos transactions as hex strings
     */
    async signTransactions(transactions: SimpleTransaction[]): Promise<string[]> {
        const signedTransactions: string[] = []

        for (const transaction of transactions) {
            const signedTx = await this.signTransaction(transaction)
            signedTransactions.push(signedTx)
        }

        return signedTransactions
    }

    /**
     * Read from a smart contract directly (bypasses Demos Network)
     * Use only when explicit direct access is needed
     * @param moduleAddress The module address
     * @param moduleName The module name
     * @param functionName The function name
     * @param args Function arguments
     * @param typeArguments Type arguments for generic functions (optional)
     * 
     * @returns The function result
     */
    async readFromContractDirect(
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
     * Read from a smart contract via Demos Network XM operation (default behavior)
     * @param moduleAddress The module address
     * @param moduleName The module name
     * @param functionName The function name
     * @param args Function arguments
     * @param typeArguments Type arguments for generic functions (optional)
     * 
     * @returns The XMScript object ready to be used in a Demos transaction
     */
    async readFromContract(
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments: string[] = []
    ): Promise<XMScript> {
        const subchain = this.network === Network.MAINNET ? "mainnet" :
            this.network === Network.TESTNET ? "testnet" : "devnet"
        return {
            operations: {
                "aptos_contract_read": {
                    chain: "aptos",
                    subchain: subchain,
                    task: {
                        type: "contract_read",
                        params: {
                            moduleAddress: moduleAddress,
                            moduleName: moduleName,
                            functionName: functionName,
                            args: args,
                            typeArguments: typeArguments
                        },
                        signedPayloads: []
                    },
                    is_evm: false,
                    rpc: null,
                }
            },
            operations_order: ["aptos_contract_read"]
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
     * 
     * @returns The XMScript object ready to be used in a Demos transaction
     */
    async writeToContract(
        moduleAddress: string,
        moduleName: string,
        functionName: string,
        args: any[],
        typeArguments: string[] = []
    ): Promise<XMScript> {
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

            const signedTx = await this.signTransaction(transaction)
            const subchain = this.network === Network.MAINNET ? "mainnet" :
                this.network === Network.TESTNET ? "testnet" : "devnet"

            return {
                operations: {
                    "aptos_contract_write": {
                        chain: "aptos",
                        subchain: subchain,
                        task: {
                            type: "contract_write",
                            params: {
                                moduleAddress: moduleAddress,
                                moduleName: moduleName,
                                functionName: functionName,
                                args: args,
                                typeArguments: typeArguments
                            },
                            signedPayloads: [signedTx]
                        },
                        is_evm: false,
                        rpc: null,
                    }
                },
                operations_order: ["aptos_contract_write"]
            }
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