import {
    Network,
    Account,
} from "@aptos-labs/ts-sdk"

import { APTOS as AptosCore, IDefaultChainWeb, required } from "../core"

/**
 * Aptos WebSDK implementation for browser environments
 * Extends the core APTOS class with browser-specific functionality
 */
export class APTOS extends AptosCore implements IDefaultChainWeb {
    private walletAdapter: any = null

    constructor(rpc_url: string = "", network: Network = Network.DEVNET) {
        super(rpc_url, network)
    }

    /**
     * Connect to a wallet. In browser environment, this can connect to wallet extensions
     * or use a private key for direct connection.
     * @param privateKey Optional private key for direct connection
     * @returns The connected account or wallet adapter
     */
    override async connectWallet(privateKey?: string): Promise<Account | any> {
        // If private key is provided, use direct connection
        if (privateKey) {
            return await super.connectWallet(privateKey)
        }

        // Check for browser wallet adapters
        if (typeof window !== "undefined") {
            return await this.connectBrowserWallet()
        }

        throw new Error("No private key provided and no browser wallet available")
    }

    /**
     * Connect to a browser-based Aptos wallet (like Petra, Martian, etc.)
     * @returns The wallet adapter
     */
    private async connectBrowserWallet(): Promise<any> {
        try {
            // Check for Petra wallet
            if (this.detectPetraWallet()) {
                return await this.connectPetraWallet()
            }

            // Check for Martian wallet
            if (this.detectMartianWallet()) {
                return await this.connectMartianWallet()
            }

            // Check for other Aptos wallets
            if (this.detectAptosWallet()) {
                return await this.connectAptosWallet()
            }

            throw new Error("No Aptos wallet detected. Please install Petra, Martian, or another Aptos wallet.")
        } catch (error) {
            throw new Error(`Failed to connect browser wallet: ${error}`)
        }
    }

    /**
     * Detect Petra wallet
     */
    private detectPetraWallet(): boolean {
        return typeof window !== "undefined" && 
               "aptos" in window && 
               (window as any).aptos?.isPetra === true
    }

    /**
     * Detect Martian wallet
     */
    private detectMartianWallet(): boolean {
        return typeof window !== "undefined" && 
               "martian" in window
    }

    /**
     * Detect generic Aptos wallet
     */
    private detectAptosWallet(): boolean {
        return typeof window !== "undefined" && 
               "aptos" in window
    }

    /**
     * Connect to Petra wallet
     */
    private async connectPetraWallet(): Promise<any> {
        const wallet = (window as any).aptos
        
        try {
            const response = await wallet.connect()
            this.walletAdapter = wallet
            this.connected = true
            
            // Create a mock account object for compatibility
            this.account = {
                accountAddress: response.address,
                publicKey: response.publicKey,
                // Note: Private key is not available from wallet adapters
            } as any
            
            this.wallet = this.walletAdapter
            return this.walletAdapter
        } catch (error) {
            throw new Error(`Failed to connect to Petra wallet: ${error}`)
        }
    }

    /**
     * Connect to Martian wallet
     */
    private async connectMartianWallet(): Promise<any> {
        const wallet = (window as any).martian
        
        try {
            const response = await wallet.connect()
            this.walletAdapter = wallet
            this.connected = true
            
            this.account = {
                accountAddress: response.address,
                publicKey: response.publicKey,
            } as any
            
            this.wallet = this.walletAdapter
            return this.walletAdapter
        } catch (error) {
            throw new Error(`Failed to connect to Martian wallet: ${error}`)
        }
    }

    /**
     * Connect to generic Aptos wallet
     */
    private async connectAptosWallet(): Promise<any> {
        const wallet = (window as any).aptos
        
        try {
            const response = await wallet.connect()
            this.walletAdapter = wallet
            this.connected = true
            
            this.account = {
                accountAddress: response.address,
                publicKey: response.publicKey,
            } as any
            
            this.wallet = this.walletAdapter
            return this.walletAdapter
        } catch (error) {
            throw new Error(`Failed to connect to Aptos wallet: ${error}`)
        }
    }

    /**
     * Get the wallet address (override for browser wallet compatibility)
     */
    override getAddress(): string {
        if (this.walletAdapter && this.account) {
            return this.account.accountAddress.toString()
        }
        
        return super.getAddress()
    }

    /**
     * Sign a message using browser wallet or private key
     */
    override async signMessage(message: string): Promise<Uint8Array> {
        // If using wallet adapter
        if (this.walletAdapter) {
            try {
                const response = await this.walletAdapter.signMessage({
                    message,
                    nonce: Date.now().toString() // Add nonce for security
                })
                
                return new TextEncoder().encode(response.signature)
            } catch (error) {
                throw new Error(`Failed to sign message with wallet: ${error}`)
            }
        }
        
        // Fallback to private key signing
        return super.signMessage(message)
    }

    /**
     * Sign and submit transaction using browser wallet or private key
     */
    override async signTransaction(transaction: any): Promise<Uint8Array> {
        // If using wallet adapter
        if (this.walletAdapter) {
            try {
                const response = await this.walletAdapter.signAndSubmitTransaction(transaction)
                return new TextEncoder().encode(response.hash)
            } catch (error) {
                throw new Error(`Failed to sign transaction with wallet: ${error}`)
            }
        }
        
        // Fallback to private key signing
        return super.signTransaction(transaction)
    }

    /**
     * Sign transaction without submitting (for wallet adapters that support it)
     */
    async signTransactionOnly(transaction: any): Promise<Uint8Array> {
        if (this.walletAdapter && this.walletAdapter.signTransaction) {
            try {
                const signedTx = await this.walletAdapter.signTransaction(transaction)
                return signedTx
            } catch (error) {
                throw new Error(`Failed to sign transaction: ${error}`)
            }
        }
        
        throw new Error("Wallet does not support transaction signing without submission")
    }

    /**
     * Disconnect from wallet
     */
    override async disconnect(): Promise<boolean> {
        if (this.walletAdapter && this.walletAdapter.disconnect) {
            try {
                await this.walletAdapter.disconnect()
            } catch (error) {
                console.warn("Error disconnecting wallet:", error)
            }
        }
        
        this.walletAdapter = null
        await super.disconnect()
        return !this.connected
    }

    /**
     * Check if wallet is connected
     */
    isWalletConnected(): boolean {
        if (this.walletAdapter) {
            return this.walletAdapter.isConnected === true
        }
        
        return this.connected && this.account !== null
    }

    /**
     * Get connected wallet info
     */
    getWalletInfo(): any {
        if (this.walletAdapter) {
            return {
                name: this.walletAdapter.name || "Unknown",
                account: this.account,
                isConnected: this.isWalletConnected()
            }
        }
        
        return {
            name: "Direct Connection",
            account: this.account,
            isConnected: this.connected
        }
    }

    /**
     * Request wallet permissions (for some wallet adapters)
     */
    async requestPermissions(): Promise<any> {
        if (this.walletAdapter && this.walletAdapter.requestPermissions) {
            return await this.walletAdapter.requestPermissions()
        }
        
        return null
    }

    /**
     * Get network from wallet (if supported)
     */
    async getWalletNetwork(): Promise<any> {
        if (this.walletAdapter && this.walletAdapter.network) {
            return this.walletAdapter.network()
        }
        
        return this.network
    }

    /**
     * Switch network in wallet (if supported)
     */
    async switchNetwork(network: Network): Promise<boolean> {
        if (this.walletAdapter && this.walletAdapter.changeNetwork) {
            try {
                await this.walletAdapter.changeNetwork(network)
                this.setNetwork(network)
                return true
            } catch (error) {
                console.error("Failed to switch network:", error)
                return false
            }
        }
        
        // Fallback: just update local network
        this.setNetwork(network)
        return true
    }
}