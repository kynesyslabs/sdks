import { BridgeOperation } from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { demos } from "@/websdk"

export const methods = {

    /**
     * Generates a new operation, its corresponding Transaction and returns it
     * TODO Implement the params 
    */
    generateOperation(): Transaction {
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
        transaction.content.type = "nativeBridge"

        // TODO Implement the operation 
        // TODO Implement the transaction
        transaction.content.data = ["nativeBridge", operation]
        

        return transaction
    }   
}

