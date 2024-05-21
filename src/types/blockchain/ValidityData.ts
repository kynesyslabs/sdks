import { pki } from 'node-forge'
import { Operation } from '../gls/Operation'
import { Transaction } from './Transaction'

export class ValidityData {
    // Empty object
    data: {
        valid: boolean
        reference_block: number
        message: string
        gas_operation: Operation
        transaction: Transaction
    }
    signature: pki.ed25519.BinaryBuffer
    rpc_public_key: pki.ed25519.BinaryBuffer

    constructor(transaction: Transaction, publicKey: pki.ed25519.BinaryBuffer, reference_block: number) {

        this.data = {
            valid: false,
            reference_block: reference_block,
            message: "",
            gas_operation: null,
            transaction: transaction,
        }
        this.signature = null,
            this.rpc_public_key = publicKey

    }
}