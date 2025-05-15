import { Cryptography, Hashing } from "@/encryption"
import { BridgeOperation, BridgeOperationCompiled } from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { demos } from "@/websdk"
import { sha256 } from '@noble/hashes/sha2';
import { NodeCall, RPCRequest } from "@/types";

export const methods = {

    /**
     * Generates a new operation, ready to be sent to the node as a RPCRequest
     * TODO Implement the params 
     * REVIEW Should we use the identity somehow or we keep using the private key?
    */
    generateOperation(privateKey: string): RPCRequest {
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
        let nodeCallPayload: RPCRequest = {
            method: "nativeBridge",
            params: [operation]
        }
        return nodeCallPayload
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

