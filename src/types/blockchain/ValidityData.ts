import { pki } from "node-forge"
import { Operation } from "../gls/Operation"
import { Transaction } from "./Transaction"
import { Cryptography } from "@/encryption/Cryptography"
import { Hashing } from "@/encryption/Hashing"
import { SigningAlgorithm } from "../cryptography"
import { ValidityDataCustomCharges } from "./CustomCharges"
// import terminalkit from "terminal-kit"
// const term = terminalkit.terminal

export interface ValidityData {
    data: {
        valid: boolean
        reference_block: number
        message: string
        gas_operation: Operation
        transaction: Transaction
        // REVIEW: Phase 9 - Custom charges response from confirmTx
        // Shows actual cost vs max signed cost for variable-cost operations
        custom_charges?: ValidityDataCustomCharges
    }
    signature: {
        type: SigningAlgorithm
        data: string
    }
    rpc_public_key: {
        type: SigningAlgorithm
        data: string
    }
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
        // REVIEW: Phase 9 - Custom charges response
        custom_charges?: ValidityDataCustomCharges
    }
    signature: {
        type: SigningAlgorithm
        data: string
    }
    rpc_public_key: {
        type: SigningAlgorithm
        data: string
    }

    // Instantiation
    // constructor(
    //     transaction: Transaction,
    //     publicKey: pki.ed25519.BinaryBuffer,
    //     reference_block: number,
    // ) {
    //     this.data = {
    //         valid: false,
    //         reference_block: reference_block,
    //         message: "",
    //         gas_operation: null,
    //         transaction: transaction,
    //     }
    //     ;(this.signature = null), (this.rpc_public_key = publicKey)
    // }

    // // On the fly compilation
    // public static compile(
    //     validityData: ValidityData,
    //     message: string,
    //     privateKey: pki.ed25519.BinaryBuffer,
    //     valid: boolean,
    // ): ValidityData {
    //     validityData.data.message = message
    //     if (!valid) {
    //         // term.bold.red(message)
    //         console.log(message)
    //         validityData.data.valid = false
    //     } else {
    //         validityData.data.valid = true
    //     }
    //     let hash = Hashing.sha256(JSON.stringify(validityData.data))
    //     validityData.signature = Cryptography.sign(hash, privateKey)
    //     return validityData
    // }
}
