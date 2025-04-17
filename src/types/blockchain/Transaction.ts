import * as forge from "node-forge"
import { ISignature } from "./ISignature"
import { TxFee } from "./TxFee"
import { DemoScript } from "../demoswork"
import { IWeb2Payload } from "../web2"
import { XMScript } from "../xm"
import { GCREdit, GCREditIncentive } from "./GCREdit"
import { INativePayload } from "../native"
import { SubnetPayload } from "../../l2ps"
import { IdentityPayload } from "../abstraction"
// export type StringifiedPayload = [string, string]

export type TransactionContentData =
    | ["web2Request", IWeb2Payload]
    | ["crosschainOperation", XMScript]
    | ["native", INativePayload]
    | ["demoswork", DemoScript]
    | ["subnet", SubnetPayload]
    | ["identity", IdentityPayload]
    | ["incentive", GCREditIncentive]

// NOTE: This type replaced the above _TransactionContent
// It uses a DemoScript to handle the data field as per the DEMOS specifications
export interface TransactionContent {
    type:
        | "web2Request"
        | "crosschainOperation"
        | "subnet"
        | "native"
        | "demoswork"
        | "genesis"
        | "NODE_ONLINE"
        | "identity"
        | "incentive"
    from: forge.pki.ed25519.BinaryBuffer | forge.pki.PublicKey | ISignature
    to: forge.pki.ed25519.BinaryBuffer | forge.pki.PrivateKey | ISignature
    amount: number
    // TODO Replace below with data: XMPayload | Web2Payload | NativePayload when ready
    data: TransactionContentData
    // REVIEW Operation structure
    gcr_edits: GCREdit[] // This will be executed by the node(s) when the transaction is confirmed or synced
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
