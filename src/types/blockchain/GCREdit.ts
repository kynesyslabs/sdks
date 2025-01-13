// TODO See handleGCR.ts for the execution of the GCREdit
// TODO See endpointHandlers.ts for the derivation of the GCREdit from a Transaction (see handleExecuteTransaction)

export interface GCREditBalance {
    type: "balance"
    operation: "add" | "remove"
    account: string
    amount: number
    txhash: string
}
export interface GCREditNonce {
    type: "nonce"
    operation: "add" | "remove"
    account: string
    amount: number
    txhash: string
}

export interface GCREditAssign {
    type: "assign"
    account: string
    context: "native" | "web2" | "xm"
    txhash: string
}

export interface GCREditAssignIdentity {
    type: "identity"
    account: string
    identity: any // TODO Define the type of the identity change object based on StoredIdentities
    txhash: string
}

export interface GCREditSubnetsTx {
    type: "subnetsTx"
    account: string
    txhash: string
    // ! Compile this based on node/src/model/entities/GCR/GCRSubnetsTxs.ts 
}

export type GCREdit = GCREditBalance | GCREditNonce | GCREditAssign | GCREditAssignIdentity | GCREditSubnetsTx
