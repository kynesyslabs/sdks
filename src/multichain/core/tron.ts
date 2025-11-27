import { IPayOptions, required } from "."
import { TronWeb } from "tronweb"
import BigNumber from "bignumber.js"
import { DefaultChain, IDefaultChainLocal } from "./types/defaultChain"
import { XmTransactionResponse, XmTransactionResult } from "./types/interfaces"

// TronWeb instance type
type TronWebInstance = InstanceType<typeof TronWeb>

export class TRON extends DefaultChain implements IDefaultChainLocal {
    declare provider: TronWebInstance
    declare wallet: TronWebInstance

    // TRX has 6 decimal places (1 TRX = 1,000,000 SUN)
    static readonly SUN_PER_TRX = 1_000_000

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = "tron"
    }

    override setRpc(rpc_url: string): void {
        this.rpc_url = rpc_url
        this.provider = new TronWeb({
            fullHost: this.rpc_url,
        })
    }

    async connect(): Promise<boolean> {
        try {
            required(this.provider, "Provider not initialized. Call setRpc first.")

            // Test connection by getting latest block
            const block = await this.provider.trx.getCurrentBlock()
            this.connected = !!block?.block_header

            return this.connected
        } catch (error) {
            console.error("[TRON] Connection failed:", error)
            this.connected = false

            return false
        }
    }

    async connectWallet(privateKey: string): Promise<TronWebInstance> {
        required(this.provider, "Provider not initialized. Call setRpc first.")

        const cleanPrivateKey = privateKey.startsWith("0x")
            ? privateKey.slice(2)
            : privateKey

        this.wallet = new TronWeb({
            fullHost: this.rpc_url,
            privateKey: cleanPrivateKey,
        })

        return this.wallet
    }

    getAddress(): string {
        required(this.wallet, "Wallet not connected")

        const address = this.wallet.defaultAddress.base58
        if (!address) {
            throw new Error("Wallet address not available")
        }

        return String(address)
    }

    async getBalance(address: string): Promise<string> {
        required(this.provider, "Provider not initialized")

        try {
            // Returns balance in SUN (1 TRX = 1,000,000 SUN)
            const balanceSun = await this.provider.trx.getBalance(address)

            return new BigNumber(balanceSun).toString()
        } catch (error) {
            console.error("[TRON] Failed to get balance:", error)

            throw error
        }
    }

    async getInfo(): Promise<any> {
        required(this.provider, "Provider not initialized")

        return await this.provider.trx.getCurrentBlock()
    }

    async createWallet(): Promise<{ address: string; privateKey: string }> {
        const account = await TronWeb.createAccount()

        return {
            address: account.address.base58,
            privateKey: account.privateKey,
        }
    }

    async signMessage(
        message: string,
        options?: { privateKey?: string }
    ): Promise<string> {
        required(this.wallet || options?.privateKey, "Wallet not connected")

        const wallet = options?.privateKey
            ? new TronWeb({ fullHost: this.rpc_url, privateKey: options.privateKey })
            : this.wallet

        const hexMessage = TronWeb.toHex(message)
        const signedMessage = await wallet.trx.signMessageV2(hexMessage)

        return signedMessage
    }

    /**
     * Verifies a signed message by recovering the signer's address
     * @param message The original message that was signed
     * @param signature The signature to verify
     * @param address The expected signer's TRON address (base58 format)
     * @returns True if the recovered address matches the provided address
     */
    async verifyMessage(
        message: string,
        signature: string,
        address: string
    ): Promise<boolean> {
        try {
            const hexMessage = TronWeb.toHex(message)
            const tronWeb = this.provider || new TronWeb({
                fullHost: this.rpc_url
            })
            const recoveredAddress = await tronWeb.trx.verifyMessageV2(hexMessage, signature)

            return recoveredAddress === address
        } catch (error) {
            console.error("[TRON] Message verification failed:", error)

            return false
        }
    }

    async signTransaction(tx: any): Promise<any> {
        required(this.wallet, "Wallet not connected")

        return await this.wallet.trx.sign(tx)
    }

    async signTransactions(
        transactions: any[],
        options?: { privateKey?: string }
    ): Promise<any[]> {
        const wallet = options?.privateKey
            ? new TronWeb({ fullHost: this.rpc_url, privateKey: options.privateKey })
            : this.wallet

        required(wallet, "Wallet not connected")

        const signedTxs: any[] = []
        for (const tx of transactions) {
            const signedTx = await wallet.trx.sign(tx)
            signedTxs.push(signedTx)
        }

        return signedTxs
    }

    /**
     * Prepare a TRX transfer transaction
     * @param receiver Recipient address (base58 format)
     * @param amount Amount in SUN (1 TRX = 1,000,000 SUN)
     * @param options Options including optional privateKey
     * @returns Signed transaction ready to broadcast
     */
    async preparePay(
        receiver: string,
        amount: string,
        options?: { privateKey?: string }
    ): Promise<any> {
        const txs = await this.preparePays([{ address: receiver, amount }], options)

        return txs[0]
    }

    /**
     * Prepare multiple TRX transfer transactions
     * @param payments Array of payments with address and amount (in SUN)
     * @param options Options including optional privateKey
     * @returns Array of signed transactions
     */
    async preparePays(
        payments: IPayOptions[],
        options?: { privateKey?: string }
    ): Promise<any[]> {
        const wallet = options?.privateKey
            ? new TronWeb({ fullHost: this.rpc_url, privateKey: options.privateKey })
            : this.wallet

        required(wallet, "Wallet not connected")

        const signedTxs: any[] = []

        for (const payment of payments) {
            const amountBN = new BigNumber(payment.amount)
            if (!amountBN.isFinite() || amountBN.isNegative()) {
                throw new Error(`Invalid payment amount: ${payment.amount}`)
            }
            // Convert to integer (SUN should be whole numbers)
            const amountIntBN = amountBN.integerValue(BigNumber.ROUND_FLOOR)

            // Validate amount doesn't exceed JavaScript's safe integer limit
            // TronWeb API requires a JavaScript Number, so we must ensure precision is preserved
            if (amountIntBN.isGreaterThan(Number.MAX_SAFE_INTEGER)) {
                throw new Error(
                    `Payment amount ${payment.amount} SUN exceeds maximum safe integer (${Number.MAX_SAFE_INTEGER}). ` +
                    `Maximum supported amount is ~9,007,199 TRX.`
                )
            }
            const amountInSun = amountIntBN.toNumber()

            const fromAddress = wallet.defaultAddress.base58
            if (!fromAddress) {
                throw new Error("Wallet address not available")
            }

            const unsignedTx = await wallet.transactionBuilder.sendTrx(
                payment.address,
                amountInSun,
                String(fromAddress)
            )

            const signedTx = await wallet.trx.sign(unsignedTx)
            signedTxs.push(signedTx)
        }

        return signedTxs
    }

    /**
     * Broadcast a signed transaction to the network
     * @param signedTx The signed transaction
     * @returns Transaction response with result and hash
     */
    async sendTransaction(signedTx: any): Promise<XmTransactionResponse> {
        required(this.provider, "Provider not initialized")

        try {
            const result = await this.provider.trx.sendRawTransaction(signedTx)

            if (result.result === true) {
                return {
                    result: XmTransactionResult.success,
                    hash: result.txid || result.transaction?.txID,
                }
            }

            return {
                result: XmTransactionResult.error,
                error: result.message || String(result.code) || "Transaction failed",
            }
        } catch (error: any) {
            console.error("[TRON] Send transaction failed:", error)

            return {
                result: XmTransactionResult.error,
                error: error.message || error.toString(),
            }
        }
    }

    getEmptyTransaction(): any {
        return {}
    }

    /**
     * Convert TRX to SUN
     * @param trx Amount in TRX
     * @returns Amount in SUN as bigint
     */
    static trxToSun(trx: string | number): bigint {
        const trxNum = typeof trx === "string" ? parseFloat(trx.trim() || "0") : trx

        if (!Number.isFinite(trxNum)) {
            throw new Error(`Invalid TRX amount: ${trx}`)
        }

        const sun = Math.round(trxNum * TRON.SUN_PER_TRX)

        return BigInt(sun)
    }

    /**
     * Convert SUN to TRX with full precision preservation
     * @param sun Amount in SUN as bigint
     * @returns Amount in TRX as a decimal string (e.g., "123.456789")
     * @note This method returns a string to preserve precision for large values.
     *       For display purposes, you may want to parse this with a BigNumber library.
     */
    static sunToTrx(sun: bigint): string {
        const sunPerTrx = BigInt(TRON.SUN_PER_TRX)
        const integerPart = sun / sunPerTrx
        const remainder = sun % sunPerTrx

        // Handle negative values
        const isNegative = sun < 0n
        const absRemainder = isNegative ? -remainder : remainder

        // Pad remainder to 6 decimal places (TRON has 6 decimals)
        const fractionalStr = absRemainder.toString().padStart(6, "0")

        // Remove trailing zeros for cleaner output, but keep at least one decimal
        const trimmedFractional = fractionalStr.replace(/0+$/, "") || "0"

        if (trimmedFractional === "0") {
            return integerPart.toString()
        }

        return `${integerPart}.${trimmedFractional}`
    }
}
