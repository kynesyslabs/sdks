import { TxFee } from '../blockchain/TxFee'

export interface Operation {
    operator: string
    actor: string
    params: any // Documented in the chain itself
    hash: string
    nonce: number
    timestamp: number
    status: boolean | 'pending'
    fees: TxFee
}

export interface OperationResult {
    success: boolean
    message: string
}

// WIP Making 'operations' registry more stable through db writing or file writing
export interface OperationRegistrySlot {
    operation: Operation
    status: boolean | 'pending'
    result: OperationResult
    timestamp: number
}
