import {
    AccountInfoRequest,
    Client,
    Transaction,
    Wallet,
    xrpToDrops,
} from 'xrpl'

import { DefaultChain, IPayOptions, required } from '@/multichain/core'

/**
 * Get the last sequence number of an address
 * @param address The address
 * @returns The last sequence number
 */
export async function xrplGetLastSequence(provider: Client, address: string) {
    // INFO: Get user's current sequence
    // Code extracted from the xrpl library
    // By following this.provider.autofill
    const request: AccountInfoRequest = {
        command: 'account_info',
        account: address,
        ledger_index: 'current',
    }

    const account_info = await provider.request(request)
    const currentSequence = account_info.result.account_data.Sequence

    return currentSequence
}

export class XRPL extends DefaultChain {
    declare provider: Client
    declare wallet: Wallet

    constructor(rpc_url: string) {
        super(rpc_url)
        this.name = 'xrpl'

        if (rpc_url) {
            this.setRpc(rpc_url)
        }
    }

    // SECTION: Providers

    // INFO Set of methods for connecting to an RPC while
    // retaining a granular control over the instance status
    override async setRpc(rpc_url: string) {
        this.rpc_url = rpc_url
        this.provider = new Client(rpc_url, {
            connectionTimeout: 10000,
        })
    }

    async connect(with_reconnect: boolean = true) {
        // INFO Connects to the provider with error handling
        let trial_index = 0
        let maxTrials = 3

        const providerConnect = async () => {
            try {
                await this.provider.connect()
                return true
            } catch (error) {
                trial_index++
                if (trial_index == maxTrials) {
                    // INFO: Return false if we failed to connect
                    return false
                }

                // INFO: Retry for the Nth time
                await providerConnect()
            }

            return false
        }

        // Listen for connection events
        this.provider.on('connected', () => {
            console.log('Successfully connected to XRPL.')
            this.connected = true
        })

        // Handle disconnection events
        // INFO: with_reconnect = false is used to exit tests without open handles
        if (with_reconnect) {
            this.provider.on('disconnected', async (code) => {
                // Handle the disconnection event (e.g., attempt to reconnect)
                console.log(
                    `Disconnected from XRPL with code: ${code}, reconnecting: ${with_reconnect}`
                )
                this.connected = false
                this.connected = await providerConnect()
            })
        }

        // Handle errors
        this.provider.on('error', (errorCode, errorMessage, data) => {
            console.log(`XRPL Client Error: ${errorCode}, ${errorMessage}`)
            // Handle the error based on errorCode and errorMessage
        })

        // Finally, connect to the provider
        this.connected = await providerConnect()
        return this.connected
    }

    // static override async create(rpc_url: string) {
    //     const instance = new XRPL(rpc_url)
    //     // instance.setRpc(rpc_url)

    //     if (rpc_url) {
    //         await instance.connect('')
    //     }

    //     return instance
    // }

    // SECTION: Wallets

    // INFO Connecting a wallet through a private key (string)
    async connectWallet(privateKey: string) {
        this.wallet = Wallet.fromSeed(privateKey)

        return this.wallet
    }

    getAddress() {
        return this.wallet.address
    }

    // SECTION: Reads

    // REVIEW: getBalance return type. Should it be a string or an object?
    async getBalance(address: string, multi: boolean = true) {
        let response = null
        if (multi) {
            response = await this.provider.getBalances(address)
        } else {
            response = await this.provider.getXrpBalance(address)
        }

        return response as string
    }

    // SECTION: Writes

    // INFO Signing a transaction
    // with a private key or by using our stored wallet
    async signTransaction(
        transaction: Transaction,
        options?: {
            privateKey: string
        }
    ) {
        // INFO: Call signTransactions with a single transaction
        const txs = await this.signTransactions([transaction], options)

        return txs[0]
    }

    async signTransactions(
        transactions: Transaction[],
        options?: {
            privateKey: string
        }
    ) {
        // INFO: If a private key is provided, override the wallet
        // REVIEW: Should we assign the new wallet to this.wallet?
        if (options?.privateKey) {
            this.wallet = Wallet.fromSeed(options.privateKey)
        }

        // INFO: Check if wallet is connected
        required(this.wallet, 'Wallet not connected')

        let currentSequence = await xrplGetLastSequence(
            this.provider,
            this.getAddress()
        )
        return transactions.map((tx) => {
            tx.Sequence = currentSequence

            // INFO: Increment the sequence for the next transaction
            currentSequence++

            // NOTE: this.wallet.sign is not async
            return this.wallet.sign(tx)
        })
    }

    async preparePay(address: string, amount: number | string) {
        required(this.wallet, 'Wallet not connected')

        // INFO: Call preparePays with a single payment
        const txs = await this.preparePays([{ address, amount }])

        return txs[0]
    }

    async preparePays(payments: IPayOptions[]) {
        const base_tx = await this.getEmptyTransaction()

        const txs = payments.map((payment) => {
            // Copy the base tx
            const tx = {
                ...base_tx,

                // Set amount and destination
                Destination: payment.address,
                Amount: xrpToDrops(payment.amount),
                // INFO: Sequence number will be set by this.signTransactions
            }

            return tx
        })

        // INFO: Return a list of signed transactions
        return this.signTransactions(txs)
    }

    // SECTION: Utils

    // INFO Generic empty tx skeleton for this chain
    async getEmptyTransaction() {
        // INFO: Autofill the transaction
        const tx = await this.provider.autofill({
            TransactionType: 'Payment',
            Account: this.getAddress(),
            Amount: xrpToDrops(0),
            Destination: '',
            Sequence: 0,
        })

        return tx
    }

    override async disconnect() {
        await this.provider.disconnect()
        this.resetInstance()

        return !this.connected
    }
}
