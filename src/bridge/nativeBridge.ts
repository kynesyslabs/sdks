import { Cryptography, Hashing } from "@/encryption"
import {
    BridgeOperation,
    BridgeOperationCompiled,
    SupportedChain,
    SupportedEVMChain,
    SupportedStablecoin,
    supportedEVMChains,
    SupportedNonEVMChain,
    supportedNonEVMChains,
} from "./nativeBridgeTypes"
import { Transaction } from "@/types/blockchain/Transaction"
import { RPCRequest } from "@/types"

export const methods = {
    /**
     * Validates the chain
     * @param chain
     * @param chainType
     * @param isOrigin (useful for error messages)
     */
    validateChain (
        chain: string,
        chainType: string,
        isOrigin: boolean,
    ) {
        const chainTypeStr = isOrigin ? "origin" : "destination"
        if (chainType === "EVM") {
            if (!supportedEVMChains.includes(chain as SupportedEVMChain)) {
                throw new Error(
                    `Invalid ${chainTypeStr} chain: ${chain} is not a supported EVM`,
                )
            }
        } else {
            if (
                !supportedNonEVMChains.includes(
                    chain as SupportedNonEVMChain,
                )
            ) {
                throw new Error(
                    `Invalid ${chainTypeStr} chain: ${chain} is not a supported chain`,
                )
            }
        }
    },
    /**
     * Generates a new operation, ready to be sent to the node as a RPCRequest
     * TODO Implement the params
     * REVIEW Should we use the identity somehow or we keep using the private key?
     */
    generateOperation(
        privateKey: string,
        publicKey: string,
        originChainType: SupportedChain,
        originChain: SupportedEVMChain | SupportedNonEVMChain,
        destinationChainType: SupportedChain,
        destinationChain: SupportedEVMChain | SupportedNonEVMChain,
        originAddress: string,
        destinationAddress: string,
        amount: string,
        token: SupportedStablecoin,
    ): RPCRequest {
        // Ensuring the chains are valid: throw an error if not
        this.validateChain(originChain, originChainType, true)
        this.validateChain(destinationChain, destinationChainType, false)
        // Defining the operation
        const operation: BridgeOperation = {
            demoAddress: publicKey,
            originChainType: originChainType,
            originChain: originChain,
            destinationChainType: destinationChainType,
            destinationChain: destinationChain,
            originAddress: originAddress,
            destinationAddress: destinationAddress,
            amount: amount,
            token: token,
            txHash: "",
            status: "empty",
        }
        // REVIEW Sign the operation
        let opHash = Hashing.sha256(JSON.stringify(operation))
        let signature = Cryptography.sign(opHash, privateKey)
        let hexSignature = new TextDecoder().decode(signature)
        let nodeCallPayload: RPCRequest = {
            method: "nativeBridge",
            params: [operation, hexSignature],
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
        // Preparing the known values for the transaction
        const tx: Transaction = {
            content: {
                type: "nativeBridge",
                data: ["nativeBridge", compiled],
                from: "", // TODO Implement from using the identity
                to: "", // TODO Same as from
                ed25519_address: "",
                amount: 0,
                gcr_edits: [],
                nonce: 0,
                timestamp: Date.now(),
                transaction_fee: { // TODO Compile with the BridgeOperationCompiled object content
                    network_fee: 0,
                    rpc_fee: 0,
                    additional_fee: 0,
                },
            },
            signature: {
                type: "ed25519",
                data: "",
            },
            hash: "",
            status: "empty",
            blockNumber: 0,
            ed25519_signature: ""
        }
        // TODO Hash and sign the transaction
        return tx
    },
}
