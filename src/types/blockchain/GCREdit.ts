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
export type GCREdit = GCREditBalance | GCREditNonce | GCREditAssign
