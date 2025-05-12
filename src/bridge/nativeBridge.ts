import { BridgeOperation } from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { demos } from "@/websdk"

export const methods = {

    /**
     * Generates a new operation, its corresponding Transaction and returns it
     * TODO Implement the params 
    */
    generateOperation(): {operation: BridgeOperation, transaction: Transaction} {
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

        // Defining the transaction
        var transaction: Transaction = demos.transactions.empty()
        
        // TODO Implement the operation 
        // TODO Implement the transaction

        return {operation, transaction}
    }   
}

