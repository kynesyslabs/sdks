import * as forge from 'node-forge'
import { ISignature } from './ISignature'
import { TxFee } from './TxFee'

import { IWeb2Request } from '../web2'
import { XMScript } from '../xm'

export type XMPayload = ["xm", XMScript]
export type Web2Payload = ["web2", IWeb2Request]
export type NativePayload = ["native", any] // TODO



export interface TransactionContent {
    type: string
    from: forge.pki.ed25519.BinaryBuffer | forge.pki.PublicKey | ISignature
    to: forge.pki.ed25519.BinaryBuffer | forge.pki.PrivateKey | ISignature
    amount: number
    // TODO Replace below with data: XMPayload | Web2Payload | NativePayload when ready
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
