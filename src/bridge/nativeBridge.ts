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
        return null
    },
}
