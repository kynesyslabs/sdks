// TODO See handleGCR.ts for the execution of the GCREdit
// TODO See endpointHandlers.ts for the derivation of the GCREdit from a Transaction (see handleExecuteTransaction)

import { NomisWalletIdentity, PqcIdentityAssignPayload, PqcIdentityRemovePayload, XMCoreTargetIdentityPayload } from "../abstraction"
import { SigningAlgorithm } from "../cryptography"

export interface GCREditBalance {
    type: "balance"
    isRollback: boolean
    operation: "add" | "remove"
    account: string
    amount: number
    txhash: string
}
export interface GCREditNonce {
    type: "nonce"
    isRollback: boolean
    operation: "add" | "remove"
    account: string
    amount: number
    txhash: string
}

export interface GCREditAssign {
    type: "assign"
    isRollback: boolean
    account: string
    context: "native" | "web2" | "xm"
    txhash: string
}

export interface GCREditAssignIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    identity: any // TODO Define the type of the identity change object based on StoredIdentities
    txhash: string
}

export interface GCREditSubnetsTx {
    type: "subnetsTx"
    isRollback: boolean
    account: string
    txhash: string
    // ! Compile this based on node/src/model/entities/GCR/GCRSubnetsTxs.ts
}

export interface XmGCRData {
    chain: string
    subchain: string
    identity: string
}

export interface XmGCRIdentityData {
    chain: string
    subchain: string
    targetAddress: string
    signature: string
    publicKey: string
    isEVM: boolean
    timestamp: number
}

export interface Web2GCRData {
    context: string
    data: {
        username: string
        proof: string
        proofHash: string
        userId: string
        timestamp: number
    }
}

export interface PQCIdentityGCREditData {
    algorithm: SigningAlgorithm
    address: string
    signature: string
    timestamp: number
}

export interface UdGCRData {
    domain: string
    resolvedAddress: string
    signature: string
    publicKey: string
    timestamp: number
    network: "polygon" | "ethereum" // Network where domain is registered
    registryType: "UNS" | "CNS"
}

export interface GCREditIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    context: "xm" | "web2" | "pqc" | "nomis" | "ud"
    operation: "add" | "remove"
    data:
    | Web2GCRData // web2 add or remove identity
    | XmGCRIdentityData // xm add identity
    | XMCoreTargetIdentityPayload // xm remove identity
    | PQCIdentityGCREditData[] // pqc add identity
    | PqcIdentityRemovePayload["payload"] // pqc remove identity
    | UdGCRData // ud add identity
    | { domain: string } // ud remove identity
    | NomisWalletIdentity // nomis add/remove identity
    txhash: string
    referralCode?: string
}

export interface GCREditSmartContract {
    type: "smartContract"
    operation: "deploy" | "call" | "store" | "retrieve"
    account: string           // Contract address
    txhash: string
    isRollback: boolean

    // Deploy-specific fields
    code?: string
    deployer?: string

    // Call-specific fields
    method?: string
    args?: any[]

    // State-specific fields
    key?: string
    value?: any

    // Results
    result?: any
    gasUsed?: number
}

export interface GCREditStorageProgram {
    type: "storageProgram"
    target: string              // Storage program address
    isRollback: boolean
    txhash: string
    context: {
        operation: string       // CREATE, WRITE, DELETE, UPDATE_ACCESS_CONTROL
        sender: string          // Transaction sender
        data?: {                // Optional for DELETE operations
            variables: any      // Key-value storage data
            metadata: any       // Program metadata (deployer, accessControl, etc.)
        }
    }
}

export type GCREdit =
    | GCREditBalance
    | GCREditNonce
    | GCREditAssign
    | GCREditAssignIdentity
    | GCREditSubnetsTx
    | GCREditIdentity
    | GCREditSmartContract
    | GCREditStorageProgram
