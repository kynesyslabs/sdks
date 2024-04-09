import { Operation } from './Operation'
import { pki } from 'node-forge'
import { Transaction } from './Transaction'

export interface ValidityData {
    data: {
        valid: boolean
        reference_block: number
        message: string
        gas_operation: Operation
        transaction: Transaction
    }
    signature: pki.ed25519.BinaryBuffer
    rpc_public_key: pki.ed25519.BinaryBuffer
}
