import * as forge from "node-forge"
import { ISignature } from "./ISignature"
import { TxFee } from "./TxFee"
import { DemoScript } from "../demoswork"
import { IWeb2Request } from "../web2"
import { XMScript } from "../xm"

// export type StringifiedPayload = [string, string]

export type TransactionContentData =
    | ["web2Request", IWeb2Request]
    | ["crosschainOperation", XMScript]
    | ["demoswork", DemoScript]

// NOTE: This type replaced the above _TransactionContent
// It uses a DemoScript to handle the data field as per the DEMOS specifications
export interface TransactionContent {
    type: "web2Request" | "crosschainOperation" | "demoswork"
    from: forge.pki.ed25519.BinaryBuffer | forge.pki.PublicKey | ISignature
    to: forge.pki.ed25519.BinaryBuffer | forge.pki.PrivateKey | ISignature
    amount: number
    // TODO Replace below with data: XMPayload | Web2Payload | NativePayload when ready
    data: TransactionContentData
    nonce: number // Increments every time a transaction is sent from the same account
    timestamp: number // Is the registered unix timestamp when the transaction was sent the first time
    transaction_fee: TxFee // Is the signed message where the sender locks X tokens until the tx is confirmed
}

export interface Transaction {
    content: TransactionContent
    signature: ISignature | null

    hash: string
    status: string
    blockNumber: number | null
}
