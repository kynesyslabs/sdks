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
export interface TransactionResponse {
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