// TODO See handleGCR.ts for the execution of the GCREdit
// TODO See endpointHandlers.ts for the derivation of the GCREdit from a Transaction (see handleExecuteTransaction)

import { PqcIdentityRemovePayload, UDIdentityPayload, XMCoreTargetIdentityPayload, NomisWalletIdentity } from "../abstraction"
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

export type UdGCRData = UDIdentityPayload

export interface GCREditIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    context: "xm" | "web2" | "pqc" | "nomis" | "ud" | "tlsn"
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

/**
 * Escrow GCR edit operation
 * Enables trustless escrow to social identities (Twitter, GitHub, Telegram)
 */
export interface GCREditEscrow {
    type: "escrow"
    operation: "deposit" | "claim" | "refund"
    account: string  // Escrow address (for deposit/claim) or refunder address
    data: {
        // Deposit fields
        sender?: string           // Ed25519 pubkey of sender
        platform?: "twitter" | "github" | "telegram"
        username?: string         // Social username (e.g., "@bob")
        amount?: number
        expiryDays?: number       // Optional, default 30
        message?: string          // Optional memo

        // Claim fields
        claimant?: string         // Ed25519 pubkey of claimant
        claimed?: boolean         // Whether escrow has been claimed
        claimedBy?: string        // Address that claimed the escrow
        claimedAt?: number        // Timestamp when claimed

        // Refund fields
        refunder?: string         // Ed25519 pubkey of refunder
    }
    txhash: string
    isRollback: boolean
}

/**
 * TLSNotary attestation storage GCR edit
 */
export interface GCREditTLSNotary {
    type: "tlsnotary"
    operation: "store"
    account: string
    data: {
        tokenId: string
        domain: string
        proof: string          // Full proof or IPFS hash
        storageType: "onchain" | "ipfs"
        timestamp: number
    }
    txhash: string
    isRollback: boolean
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
    | GCREditEscrow
    | GCREditTLSNotary
