import * as forge from "node-forge"
import { ISignature } from "./ISignature"
import { TxFee } from "./TxFee"
import { DemoScript } from "../demoswork"
import { IWeb2Payload } from "../web2"
import { XMScript } from "../xm"
import { GCREdit } from "./GCREdit"
import { INativePayload } from "../native"
// import { SubnetPayload } from "../../l2ps" // Obsolete - using new L2PS implementation
import { IdentityPayload } from "../abstraction"
import { InstantMessagingPayload } from "../instantMessaging"
import { BridgeOperationCompiled } from "@/bridge/nativeBridgeTypes"
import { L2PSEncryptedPayload } from "@/l2ps"

// TODO Implement multisignature transactions

// export type StringifiedPayload = [string, string]

/* NOTE This is an old, backward compatible file that should be deprecated in favor of the TransactionSubtypes folder */

/* SECTION Transaction types */

export type TransactionContentData =
    | ["web2Request", IWeb2Payload]
    | ["crosschainOperation", XMScript]
    | ["native", INativePayload]
    | ["demoswork", DemoScript]
    | ["l2psEncryptedTx", L2PSEncryptedPayload]
    | ["identity", IdentityPayload]
    | ["instantMessaging", InstantMessagingPayload]
    | ["nativeBridge", BridgeOperationCompiled]

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
    | "instantMessaging"
    | "nativeBridge"
    | "l2psEncryptedTx"
    from: string
    from_ed25519_address: string
    to: string
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

    // INFO: explicit ed25519 signature for dual-signing
    ed25519_signature: string

    // INFO: Main signature (can be PQC or ed25519)
    signature: ISignature | null
    hash: string
    status: string
    blockNumber: number | null
}

// Re-export specific transaction types
export * from './TransactionSubtypes'
