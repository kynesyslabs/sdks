import { MsgSendEncodeObject, StdFee } from "@cosmjs/stargate"
import { Address, Idl } from "@project-serum/anchor"
import { Keypair, PublicKey } from "@solana/web3.js"

// SECTION: Generic Default Chain Interfaces

/**
 * `preparePay` parameters
 */
export interface IPayParams {
    address: string
    amount: number | string
}

export enum XmTransactionResult {
    success = "success",
    error = "error",
}

/**
 * The response of a XM transaction
 */
export interface XmTransactionResponse {
    /**
     * Whether the transaction was successful or not
     */
    result: XmTransactionResult

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
// ========================

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

// SECTION: Solana Interfaces
// ===========================

export interface SolanarunProgramParams {
    /**
     * The IDL of the program to call. If not provided, the IDL will be fetched from the network.
     */
    idl?:
        | Idl
        | {
              [key: string]: any
          }

    /**
     * The name of the instruction to call.
     */
    instruction: string

    /**
     * The arguments to pass to the instruction.
     */
    args?: any

    /**
     * The accounts to pass to the instruction.
     */
    accounts?: {
        [key: string]: PublicKey | string
    }

    /**
     * The fee payer of the transaction.
     */
    feePayer: PublicKey

    /**
     * Private keys to sign this transaction.
     */
    signers?: Keypair[]
}

export interface SolanaReadAccountDataOptions {
    /**
     * The IDL of the program to read from. If not provided, the IDL will be fetched from the network.
     */
    idl?: Idl | { [key: string]: any }
    /**
     * The name of the account to read from the program IDL.
     */
    name: string

    /**
     * The account's assigned program Id. If not provided, the account's owner will be fetched from the network.
     */
    programId?: Address
}

export interface SolanaRunRawProgramParams {
    /**
     * The instruction to call.
     */
    instructionName: string

    /**
     * The index of the instruction on the program definition
     */
    instructionIndex: number

    /**
     * The accounts required for this instruction
     */
    keys?: {
        pubkey: PublicKey
        isSigner: boolean
        isWritable: boolean
    }[]

    /**
     * The parameters required by the instruction
     */
    params?: any

    /**
     * Private keys to sign this transaction.
     */
    signers: Keypair[]

    /**
     * The fee payer of the transaction
     */
    feePayer: PublicKey
}
