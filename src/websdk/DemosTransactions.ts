import forge from "node-forge"

import { Demos } from "./demosclass"
import { sha256 } from "./utils/sha256"
import * as skeletons from "./utils/skeletons"

import type { SigningAlgorithm, Transaction } from "@/types"
import { IKeyPair } from "./types/KeyPair"
import { GCRGeneration } from "./GCRGeneration"
import { _required as required } from "./utils/required"
import { RPCResponseWithValidityData } from "@/types/communication/rpc"
import { Cryptography } from "@/encryption"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"
import { Enigma } from "@/encryption/PQC/enigma"

export const DemosTransactions = {
    // REVIEW All this part
    // NOTE A courtesy to get a skeleton of transactions
    empty: function () {
        return structuredClone(skeletons.transaction)
    },
    // NOTE Building a transaction without signing or hashing it
    prepare: async function (data: any = null) {
        // sourcery skip: inline-immediately-returned-variable
        const thisTx = structuredClone(skeletons.transaction)

        // if (!data.timestamp) data.timestamp = Date.now()
        // Assigning the transaction data to our object
        if (data) thisTx.content.data = data
        return thisTx
    },
    /**
     * Create a signed DEMOS transaction to send native tokens to a given address.
     *
     * @param to - The reciever
     * @param amount - The amount in DEM
     * @param demos - The demos instance (for getting the address nonce)
     *
     * @returns The signed transaction.
     */
    async pay(to: string, amount: number, demos: Demos) {
        required(demos.keypair, "Wallet not connected")

        let tx = DemosTransactions.empty()

        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await demos.getAddressNonce(publicKeyHex)

        // tx.content.from_ed25519_address = publicKeyHex
        // REVIEW Get the address nonce
        // tx.content.from = from

        tx.content.to = to
        tx.content.nonce = nonce + 1
        tx.content.amount = amount
        tx.content.type = "native"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "native",
            { nativeOperation: "send", args: [to, amount] },
        ]

        return await demos.sign(tx)
    },
    /**
     * Create a signed DEMOS transaction to send native tokens to a given address.
     *
     * @param to - The reciever
     * @param amount - The amount in DEM
     * @param demos - The demos instance (for getting the address nonce)
     *
     * @returns The signed transaction.
     */
    transfer(to: string, amount: number, demos: Demos) {
        return DemosTransactions.pay(to, amount, demos)
    },
    // NOTE Signing a transaction after hashing it
    /**
     * Signs a transaction after hashing its content.
     *
     * @deprecated Use demos.sign(tx) instead
     * 
     * @param raw_tx - The transaction to be signed.
     * @param keypair - The keypair to use for signing.
     * @returns A Promise that resolves to the signed transaction.
     */
    sign: async function (
        raw_tx: Transaction,
        keypair: IKeyPair,
        options: {
            algorithm: SigningAlgorithm
        },
    ): Promise<Transaction> {
        required(keypair, "Private key not provided")

        if (!options || !options.algorithm) {
            options = {
                algorithm: "ed25519",
            }
        }

        // REVIEW If for some reason the tx timestamp is not set, we set it to the current time
        if (!raw_tx.content.timestamp || raw_tx.content.timestamp === 0) {
            raw_tx.content.timestamp = Date.now()
        }

        // Set the public key in the transaction
        raw_tx.content.from = uint8ArrayToHex(keypair.publicKey as Uint8Array)

        // REVIEW Generate the GCREdit in the client (will be compared on the node)
        // NOTE They are created without the tx hash, which is added in the node
        raw_tx.content.gcr_edits = await GCRGeneration.generate(raw_tx)

        // Hash the content of the transaction
        raw_tx.hash = await sha256(JSON.stringify(raw_tx.content))
        raw_tx.signature = await DemosTransactions.signWithAlgorithm(
            raw_tx.hash,
            keypair,
            { algorithm: options.algorithm },
        )

        return raw_tx // Return the hashed and signed transaction
    },

    /**
     * Signs a message with a given algorithm.
     *
     * @param data - The message to sign.
     * @param keypair - The keypair to use for signing.
     * @param options.algorithm - The algorithm related to the keypair.
     * @returns A Promise that resolves to the signed message.
     */
    signWithAlgorithm: async function (
        data: string,
        keypair: IKeyPair,
        options: { algorithm: SigningAlgorithm },
    ): Promise<{
        type: SigningAlgorithm
        data: string
    }> {
        required(keypair, "Private key not provided")
        required(options && options.algorithm, "Algorithm not provided")

        if (options.algorithm === "ed25519") {
            const signature = Cryptography.sign(data, keypair.privateKey)

            return {
                type: "ed25519",
                data: uint8ArrayToHex(signature),
            }
        }

        const enigma = new Enigma()

        if (options.algorithm === "falcon") {
            const signature = await enigma.sign_falcon(data, keypair as any)

            return {
                type: "falcon",
                data: uint8ArrayToHex(signature),
            }
        }

        if (options.algorithm === "ml-dsa") {
            const buff = new TextEncoder().encode(data)
            const signature = await enigma.sign_ml_dsa(buff, keypair)

            return {
                type: "ml-dsa",
                data: uint8ArrayToHex(signature),
            }
        }

        throw new Error("Unsupported algorithm: " + options.algorithm)
    },
    // NOTE Sending a transaction after signing it
    /**
     * Confirms a transaction.
     *
     * @param transaction - The transaction to confirm
     * @returns The validity data of the transaction containing the gas information.
     */
    confirm: async function (transaction: Transaction, demos: Demos) {
        let response = await demos.call("execute", "", transaction, "confirmTx")
        console.log("response:", response)
        // If the tx is not valid, we notify the user
        if (!response.response.data.valid) {
            throw new Error(
                "[Confirm] Transaction is not valid: " +
                response.response.data.message,
            )
        }

        return response as RPCResponseWithValidityData
    },
    /**
     * Broadcasts a transaction for execution.
     *
     * @param validationData - The validity data of the transaction
     * @param demos - The demos instance
     *
     * @returns The response from the node
     */
    broadcast: async function (
        validationData: RPCResponseWithValidityData,
        demos: Demos,
    ) {
        // If the tx is not valid, we don't broadcast it
        if (!validationData.response.data.valid) {
            throw new Error(
                "[Broadcast] Transaction is not valid: " +
                validationData.response.data.message,
            )
        }
        // REVIEW Resign the Transaction hash as it has been recalculated in the node
        //let tx = validationData.response.data.transaction
        //let signedTx = await DemosTransactions.sign(tx, keypair)
        // Add the signature to the validityData
        // ! Problem: we are tampering the ValidityData, so the tx will fail miserably (see validateTransaction.ts -> signValidityData)
        // See prepare(data) for a possible solution
        //validationData.response.data.transaction = signedTx

        const res = await demos.call(
            "execute",
            "",
            validationData,
            "broadcastTx",
        )

        try {
            return {
                ...res,
                response: JSON.parse(res.response),
            }
        } catch (error) {
            return res
        }
    },
    // NOTE Subnet transactions methods are imported and exposed in demos.ts from the l2ps.ts file.
}
