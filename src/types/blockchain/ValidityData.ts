import { pki } from "node-forge"
import { Operation } from "../gls/Operation"
import { Transaction } from "./Transaction"
import { Cryptography } from "@/encryption/Cryptography"
import { Hashing } from "@/encryption/Hashing"
// import terminalkit from "terminal-kit"
// const term = terminalkit.terminal

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

// This class allows us to work with ValidityData with ease
export class CValidityData implements ValidityData {
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

    // Instantiation
    constructor(
        transaction: Transaction,
        publicKey: pki.ed25519.BinaryBuffer,
        reference_block: number,
    ) {
        this.data = {
            valid: false,
            reference_block: reference_block,
            message: "",
            gas_operation: null,
            transaction: transaction,
        }
        ;(this.signature = null), (this.rpc_public_key = publicKey)
    }

    // On the fly compilation
    public static compile(
        validityData: ValidityData,
        message: string,
        privateKey: pki.ed25519.BinaryBuffer,
        valid: boolean,
    ): ValidityData {
        validityData.data.message = message
        if (!valid) {
            // term.bold.red(message)
            console.log(message)
            validityData.data.valid = false
        } else {
            validityData.data.valid = true
        }
        let hash = Hashing.sha256(JSON.stringify(validityData.data))
        validityData.signature = Cryptography.sign(hash, privateKey)
        return validityData
    }
}
