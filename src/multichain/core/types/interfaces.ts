import { MsgSendEncodeObject, StdFee } from '@cosmjs/stargate'

// SECTION: Generic Default Chain Interfaces

/**
 * `preparePay` parameters
 */
export interface IPayOptions {
    address: string
    amount: number | string
}

/**
 * The response of a XM transaction
 */
export interface XmTransactionResponse {
    /**
     * Whether the transaction was successful or not
     */
    result: 'success' | 'error'

    /**
     * The hash of the transaction if the tx was successful
     */
    hash?: string

    /**
     * The error object if the tx failed
     */
    error?: any

    /**
     * The chain where the transaction was executed
     */
    chain?: string

    /**
     * Extra optional data about the transaction extracted from the response.
     * Currently available for XRPL transactions
     */
    extra?: { [key: string]: any }
}

// SECTION: Multiversx Interfaces

export interface EGLDSignTxOptions {
    /**
     * The private key to override the connected wallet
     */
    privateKey: string
    /**
     * The password of the override wallet
     */
    password: string
}

// SECTION: IBC Interfaces

// IBC TRANSACTION //
export interface IBCTransaction {
    signerAddress: string
    messages: MsgSendEncodeObject[]
    fee: StdFee | null
    memo: string
}

export interface IBCConnectWalletOptions {
    /**
     * The address prefix
     */
    prefix: string

    /**
     * The the price of a single unit of gas. This is typically a fraction of the smallest fee token unit, such as 0.012utoken
     */
    gasPrice: string

    /**
     * The multiplier to apply to the estimated gas price. Used to make sure transactions do not run out of gas.
     *
     * @default 2.0
     */
    multiplier?: number
}

export interface IBCGetBalanceOptions {
    /**
     * The denomination of the token
     */
    denom: string
}

export interface IBCPreparePayOptions extends IBCGetBalanceOptions {
    // These are the same as IBCGetBalanceOptions
}

export interface IBCSignTxOptions extends IBCConnectWalletOptions {
    /**
     * The private key to override the connected wallet
     */
    privateKey?: string
}
