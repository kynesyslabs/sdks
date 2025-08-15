export { APTOS } from "@kynesyslabs/xmcore"

// /**
//  * Aptos WebSDK implementation for browser environments
//  * Extends the core APTOS class with browser-specific functionality
//  */
// export class APTOS extends AptosCore implements AptosDefaultChain {
//     private walletAdapter: any = null
//     declare wallet: Account | null

//     constructor(rpc_url: string = "", network: Network = Network.DEVNET) {
//         super(rpc_url, network)
//     }

//     /**
//      * Connect to a wallet. In browser environment, this can connect to wallet extensions
//      * or use a private key for direct connection.
//      * @param privateKey Optional private key for direct connection
//      * @returns The connected account or wallet adapter
//      */
//     override async connectWallet(privateKey?: string): Promise<Account | any> {
//         // If private key is provided, use direct connection
//         if (privateKey) {
//             return await super.connectWallet(privateKey)
//         }

//         // Check for browser wallet adapters
//         if (typeof window !== "undefined") {
//             return await this.connectBrowserWallet()
//         }

//         throw new Error("No private key provided and no browser wallet available")
//     }

//     /**
//      * Connect to a browser-based Aptos wallet (like Petra, Martian, etc.)
//      * @returns The wallet adapter
//      */
//     private async connectBrowserWallet(): Promise<any> {
//         try {
//             // Check for Petra wallet
//             if (this.detectPetraWallet()) {
//                 return await this.connectPetraWallet()
//             }

//             // Check for Martian wallet
//             if (this.detectMartianWallet()) {
//                 return await this.connectMartianWallet()
//             }

//             // Check for other Aptos wallets
//             if (this.detectAptosWallet()) {
//                 return await this.connectAptosWallet()
//             }

//             throw new Error("No Aptos wallet detected. Please install Petra, Martian, or another Aptos wallet.")
//         } catch (error) {
//             throw new Error(`Failed to connect browser wallet: ${error}`)
//         }
//     }

//     /**
//      * Detect Petra wallet
//      */
//     private detectPetraWallet(): boolean {
//         return typeof window !== "undefined" &&
//             "aptos" in window &&
//             (window as any).aptos?.isPetra === true
//     }

//     /**
//      * Detect Martian wallet
//      */
//     private detectMartianWallet(): boolean {
//         return typeof window !== "undefined" &&
//             "martian" in window
//     }

//     /**
//      * Detect generic Aptos wallet
//      */
//     private detectAptosWallet(): boolean {
//         return typeof window !== "undefined" &&
//             "aptos" in window
//     }

//     /**
//      * Connect to Petra wallet
//      */
//     private async connectPetraWallet(): Promise<any> {
//         const wallet = (window as any).aptos

//         try {
//             const response = await wallet.connect()
//             this.walletAdapter = wallet
//             this.connected = true

//             // Create a mock account object for compatibility
//             this.account = {
//                 accountAddress: response.address,
//                 publicKey: response.publicKey,
//                 // Note: Private key is not available from wallet adapters
//             } as any

//             this.wallet = this.walletAdapter
//             return this.walletAdapter
//         } catch (error) {
//             throw new Error(`Failed to connect to Petra wallet: ${error}`)
//         }
//     }

//     /**
//      * Connect to Martian wallet
//      */
//     private async connectMartianWallet(): Promise<any> {
//         const wallet = (window as any).martian

//         try {
//             const response = await wallet.connect()
//             this.walletAdapter = wallet
//             this.connected = true

//             this.account = {
//                 accountAddress: response.address,
//                 publicKey: response.publicKey,
//             } as any

//             this.wallet = this.walletAdapter
//             return this.walletAdapter
//         } catch (error) {
//             throw new Error(`Failed to connect to Martian wallet: ${error}`)
//         }
//     }

//     /**
//      * Connect to generic Aptos wallet
//      */
//     private async connectAptosWallet(): Promise<any> {
//         const wallet = (window as any).aptos

//         try {
//             const response = await wallet.connect()
//             this.walletAdapter = wallet
//             this.connected = true

//             this.account = {
//                 accountAddress: response.address,
//                 publicKey: response.publicKey,
//             } as any

//             this.wallet = this.walletAdapter
//             return this.walletAdapter
//         } catch (error) {
//             throw new Error(`Failed to connect to Aptos wallet: ${error}`)
//         }
//     }

//     /**
//      * Get the wallet address (override for browser wallet compatibility)
//      */
//     override getAddress(): string {
//         if (this.walletAdapter && this.account) {
//             return this.account.accountAddress.toString()
//         }

//         return super.getAddress()
//     }

//     /**
//      * Sign a message using browser wallet or private key
//      */
//     // @ts-expect-error
//     override async signMessage(message: string): Promise<{
//         fullMessage: string,
//         signature: string
//     }> {
//         // If using wallet adapter
//         if (this.walletAdapter) {
//             const response = await this.walletAdapter.signMessage({
//                 message,
//                 nonce: Date.now().toString() // Add nonce for security
//             })

//             // Return both fullMessage and signature
//             if (response.fullMessage && response.signature) {
//                 return {
//                     fullMessage: response.fullMessage,
//                     signature: response.signature
//                 }

//             } else {
//                 throw new Error("Invalid response from wallet")
//             }
//         }

//         // Fallback to private key signing
//         const signature = await super.signMessage(message)
//         return {
//             fullMessage: message,
//             signature: signature
//         }
//     }

//     /**
//      * Sign a transaction using browser wallet or private key
//      */
//     override async signTransaction(transaction: SimpleTransaction): Promise<string> {
//         // If using wallet adapter
//         if (this.walletAdapter) {
//             try {
//                 // For wallet adapters, we need to sign without submitting
//                 if (this.walletAdapter.signTransaction) {
//                     const senderAuthenticator = await this.walletAdapter.signTransaction(transaction)

//                     // Use the same logic as core class: generate signed transaction and convert to hex
//                     const bufferTx = generateSignedTransaction({
//                         transaction,
//                         senderAuthenticator
//                     })

//                     return uint8ArrayToHex(bufferTx)
//                 } else {
//                     // If wallet doesn't support signTransaction, fall back to core implementation
//                     return super.signTransaction(transaction)
//                 }
//             } catch (error) {
//                 throw new Error(`Failed to sign transaction with wallet: ${error}`)
//             }
//         }

//         // Fallback to private key signing
//         return super.signTransaction(transaction)
//     }

//     /**
//      * Disconnect from wallet
//      */
//     override async disconnect(): Promise<boolean> {
//         if (this.walletAdapter && this.walletAdapter.disconnect) {
//             try {
//                 await this.walletAdapter.disconnect()
//             } catch (error) {
//                 console.warn("Error disconnecting wallet:", error)
//             }
//         }

//         this.walletAdapter = null
//         await super.disconnect()
//         return !this.connected
//     }

//     /**
//      * Check if wallet is connected
//      */
//     isWalletConnected(): boolean {
//         if (this.walletAdapter) {
//             return this.walletAdapter.isConnected === true
//         }

//         try {
//             if (this.wallet?.accountAddress) {
//                 return true
//             }
//         } catch {
//             return false
//         }

//         return false
//     }

//     /**
//      * Get connected wallet info
//      */
//     getWalletInfo(): any {
//         if (this.walletAdapter) {
//             return {
//                 name: this.walletAdapter.name || "Unknown",
//                 account: this.account,
//                 isConnected: this.isWalletConnected()
//             }
//         }

//         return {
//             name: "Direct Connection",
//             account: this.account,
//             isConnected: this.connected
//         }
//     }

//     /**
//      * Request wallet permissions (for some wallet adapters)
//      */
//     async requestPermissions(): Promise<any> {
//         if (this.walletAdapter && this.walletAdapter.requestPermissions) {
//             return await this.walletAdapter.requestPermissions()
//         }

//         return null
//     }

//     /**
//      * Get network from wallet (if supported)
//      */
//     getWalletNetwork(): Network {
//         if (this.walletAdapter && this.walletAdapter.network) {
//             return this.walletAdapter.network.name
//         }

//         return this.network
//     }

//     /**
//      * Switch network in wallet (if supported)
//      */
//     async switchNetwork(network: Network): Promise<boolean> {
//         if (this.walletAdapter && this.walletAdapter.changeNetwork) {
//             try {
//                 await this.walletAdapter.changeNetwork(network)
//                 this.setNetwork(network)
//                 return true
//             } catch (error) {
//                 console.error("Failed to switch network:", error)
//                 return false
//             }
//         }

//         // Fallback: just update local network
//         this.setNetwork(network)
//         return true
//     }
// }