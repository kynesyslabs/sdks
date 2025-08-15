import base58 from "bs58"
import { Keypair, VersionedTransaction } from "@solana/web3.js"

import { required } from "@demosdk/utils"
import { SolanaSignTxOptions } from "@demosdk/xmcore"
import { SOLANA as SolanaCore } from "@demosdk/xmcore"
import { PhantomProvider } from "./types/SolanaPhantomProvider"

export function detectPhantomProvider() {
    if ("phantom" in window) {
        const provider = window.phantom["solana"]

        if (provider?.isPhantom) {
            return provider as PhantomProvider
        }
    }

    return null
}

export class SOLANA extends SolanaCore {
    // @ts-expect-error
    declare wallet: Keypair | PhantomProvider

    constructor(rpc_url: string) {
        super(rpc_url)
    }

    /**
     * Connect a wallet. If running on the browser, try to connect to the Phantom wallet if no private key is provided.
     *
     * @param privateKey The private key to connect to the wallet
     * @returns The wallet object
     */
    // @ts-expect-error
    override async connectWallet(privateKey?: string) {
        // INFO: If no private key is provided, try to connect to the Phantom wallet
        if (!privateKey) {
            if (typeof window !== "undefined") {
                this.wallet = detectPhantomProvider()
                // try {
                const address = await this.wallet.connect()
                console.log(
                    "Connected to Phantom wallet: ",
                    address.publicKey.toString(),
                )
                // } catch {
                //     throw new Error("Failed to connect to Phantom wallet")
                // }
                this.connected = this.wallet.isConnected
                return this.wallet
            } else {
                throw new Error("No private key provided")
            }
        }

        const pkBuffer = base58.decode(privateKey)
        this.wallet = Keypair.fromSecretKey(pkBuffer)
        return this.wallet
    }

    override async signTransactions(
        transactions: VersionedTransaction[],
        options?: SolanaSignTxOptions,
    ) {
        required(
            this.wallet || (options && options.privateKey),
            "Wallet not connected",
        )
        let usePhantom = false

        // @ts-expect-error
        // PhantomProvider does not have a secretKey property
        if (!this.wallet.secretKey) {
            usePhantom = true
        }

        let signers = usePhantom ? [] : [this.wallet as Keypair]
        if (options && options.privateKey) {
            // INFO: If a private key is provided, override the wallet
            const privateKeyBuffer = base58.decode(options.privateKey)
            const keypair = Keypair.fromSecretKey(privateKeyBuffer)
            signers = [keypair]
        }

        if (signers.length) {
            return transactions.map(tx => {
                tx.sign(signers)
                return tx.serialize()
            })
        }

        // INFO: At this point, the wallet is a PhantomProvider
        const txs = await (this.wallet as PhantomProvider).signAllTransactions(
            // @ts-expect-error
            // VersionedTransaction[] are consumed as Transaction[] by the PhantomProvider
            transactions,
        )

        return txs.map(tx => tx.serialize())
    }

    override async disconnect() {
        // INFO: Disconnect the wallet if it is a PhantomProvider
        // @ts-expect-error
        if (this.wallet && this.wallet.privateKey) {
            await (this.wallet as PhantomProvider).disconnect()
        }
        await super.disconnect()
        return !this.connected
    }
}
