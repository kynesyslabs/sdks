import { TxFee } from "./TxFee"

export interface Operation {
    operator: string
    actor: string
    params: {} // Documented in the chain itself
    hash: string
    nonce: number
    timestamp: number
    status: boolean | "pending"
    fees: TxFee
}
