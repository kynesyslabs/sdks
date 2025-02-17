import forge from "node-forge"

import { Demos } from "./demosclass"
import { sha256 } from "./utils/sha256"
import * as skeletons from "./utils/skeletons"

import type { GCREdit, Transaction } from "@/types"
import { IKeyPair } from "./types/KeyPair"
import { GCRGeneration } from "./GCRGeneration"
import { _required as required } from "./utils/required"
import { RPCResponseWithValidityData } from "@/types/communication/rpc"

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
     * @param keypair - The keypair to sign the transaction
     *
     * @returns The signed transaction.
     */
    async pay(to: string, amount: number, keypair: IKeyPair) {
        let tx = DemosTransactions.empty()
        tx.content.from = keypair.publicKey.toString("hex")
        tx.content.to = to
        tx.content.nonce = 300
        tx.content.amount = amount
        tx.content.type = "native"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "native",
            { nativeOperation: "send", args: [to, amount] },
        ]

        return await DemosTransactions.sign(tx, keypair)
    },
    transfer(to: string, amount: number, keypair: IKeyPair) {
        return DemosTransactions.pay(to, amount, keypair)
    },
    // NOTE Signing a transaction after hashing it
    /**
     * Signs a transaction after hashing its content.
     *
     * @param raw_tx - The transaction to be signed.
     * @param keypair - The keypair to use for signing.
     * @returns A Promise that resolves to the signed transaction.
     */
    sign: async function (
        raw_tx: Transaction,
        keypair: IKeyPair,
    ): Promise<Transaction> {
        required(keypair, "Private key not provided")

        // REVIEW If for some reason the tx timestamp is not set, we set it to the current time
        if (!raw_tx.content.timestamp || raw_tx.content.timestamp === 0) {
            raw_tx.content.timestamp = Date.now()
        }

        // Set the public key in the transaction
        raw_tx.content.from = keypair.publicKey as Uint8Array

        // REVIEW Generate the GCREdit in the client (will be compared on the node)
        // NOTE They are created without the tx hash, which is added in the node
        raw_tx.content.gcr_edits = await GCRGeneration.generate(raw_tx)

        // Hash the content of the transaction
        raw_tx.hash = await sha256(JSON.stringify(raw_tx.content))

        // Sign the hash of the content
        let signatureData = forge.pki.ed25519.sign({
            message: raw_tx.hash,
            encoding: "utf8",
            privateKey: keypair.privateKey as Uint8Array,
        })

        // Set the signature in the transaction
        raw_tx.signature = {
            type: "ed25519",
            data: signatureData,
        }

        // Verify the signature (for debugging purposes)
        let verified = forge.pki.ed25519.verify({
            message: raw_tx.hash,
            encoding: "utf8",
            signature: signatureData,
            publicKey: keypair.publicKey as Uint8Array,
        })

        if (!verified) {
            throw new Error("Signature verification failed")
        }

        return raw_tx // Return the hashed and signed transaction
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
        // If the tx is not valid, we notify the user
        if (!response.response.data.valid) {
            throw new Error(
                "[Confirm] Transaction is not valid: " +
                    response.response.data.message,
            )
        }

        return response as RPCResponseWithValidityData
    },
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

        return await demos.call("execute", "", validationData, "broadcastTx")
    },
    // NOTE Subnet transactions methods are imported and exposed in demos.ts from the l2ps.ts file.
}
