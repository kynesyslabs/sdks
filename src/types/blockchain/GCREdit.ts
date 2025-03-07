// TODO See handleGCR.ts for the execution of the GCREdit
// TODO See endpointHandlers.ts for the derivation of the GCREdit from a Transaction (see handleExecuteTransaction)

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
    signature: string
    signedData: string
    targetAddress: string;
    isEVM: boolean
}

export interface Web2GCRData {
    // TODO: Define this
}

export interface GCREditIdentity {
    type: "identity"
    isRollback: boolean
    account: string
    context: "xm" | "web2"
    operation: "add" | "remove"
    data: XmGCRData | Web2GCRData | XmGCRIdentityData
    txhash: string
}

export type GCREdit =
    | GCREditBalance
    | GCREditNonce
    | GCREditAssign
    | GCREditAssignIdentity
    | GCREditSubnetsTx
    | GCREditIdentity
