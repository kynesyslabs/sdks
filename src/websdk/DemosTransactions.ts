import forge from "node-forge"

import { demos } from "./demos"
import { sha256 } from "./utils/sha256"
import * as skeletons from "./utils/skeletons"

import type { Transaction } from "@/types"
import { RPCResponseWithValidityData } from "@/types/communication/rpc"
import { IKeyPair } from "./types/KeyPair"
import { _required as required } from "./utils/required"

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

        // Set the public key in the transaction
        raw_tx.content.from = keypair.publicKey as Uint8Array

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
        console.log("Signature verified: " + verified)

        return raw_tx // Return the hashed and signed transaction
    },
    // NOTE Sending a transaction after signing it
    confirm: async function (signedPayload: Transaction) {
        let response = await demos.confirm(signedPayload)
        // response = JSON.parse(response)
        return response
    },
    broadcast: async function (validityData: RPCResponseWithValidityData) {
        // ValidityData does not need to be signed as it already contains a signature (in the Transaction object)
        // and is sent as a ComLink (thus authenticated and signed by the sender)
        let response = await demos.broadcast(validityData)
        response = JSON.parse(response)
        return response
    },
}
