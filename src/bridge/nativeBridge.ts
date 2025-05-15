import { Cryptography, Hashing } from "@/encryption"
import { BridgeOperation, BridgeOperationCompiled } from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { demos } from "@/websdk"
import { sha256 } from '@noble/hashes/sha2';

export const methods = {

    /**
     * Generates a new operation, ready to be sent to the node as a nodeCall
     * TODO Implement the params 
     * REVIEW Should we use the identity somehow or we keep using the private key?
    */
    generateOperation(privateKey: string): BridgeOperationCompiled {
        // Defining the operation
        const operation: BridgeOperation = {
            demoAddress: "",
            originChain: null,
            destinationChain: null,
            originAddress: "",
            destinationAddress: "",
            amount: "",
            token: null,
            txHash: "",
            status: "empty",
        }
        // TODO Generate the operation based on parameters
        // REVIEW Sign the operation
        let opHash = Hashing.sha256(JSON.stringify(operation))
        let signature = Cryptography.sign(opHash, privateKey)
        // TODO Call the node to send the operation
        // TODO Await the response
        // TODO Return the response
        return null
    },

    /**
     * 
     * @param compiled operation 
     * @param signature 
     * @param rpc 
     * @returns 
     */
    generateOperationTx(compiled: BridgeOperationCompiled): Transaction {
        // TODO Implement the transaction once we have the compiled operation
        return null
    }
}

