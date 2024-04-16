import { ISignature } from "./ISignature"
import * as forge from "node-forge"
import { TxFee } from "./TxFee"

export interface TransactionContent {
    type: string
    from: forge.pki.ed25519.BinaryBuffer | forge.pki.PublicKey | ISignature
    to: forge.pki.ed25519.BinaryBuffer | forge.pki.PrivateKey | ISignature
    amount: number
    data: [string, string] // type as string and content in hex string
    nonce: number // Increments every time a transaction is sent from the same account
    timestamp: number // Is the registered unix timestamp when the transaction was sent the first time
    transaction_fee: TxFee // Is the signed message where the sender locks X tokens until the tx is confirmed
}

export interface Transaction {
    content: TransactionContent
    signature: ISignature | forge.pki.ed25519.BinaryBuffer

    hash: string
    status: string
    blockNumber: number
}

