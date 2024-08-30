// INFO This module exposes methods to quickly send Web2 requests to the network

import * as skeletons from "./utils/skeletons"
// import demos from '../demos'
import { DemosTransactions } from "./DemosTransactions"
import type { IWeb2Request, Transaction } from "@/types"
import { DemosWebAuth } from "./DemosWebAuth"
import { _required as required } from "./utils/required"
import { IKeyPair } from "./types/KeyPair"

export interface IPrepareWeb2PayloadParams {
    action: string
    url: string
    parameters?: any[]
    // requestedParameters?: any
    headers?: any
    minAttestations?: number
}

// INFO Web2 Endpoints
/**
 * Prepares a Web2 payload for a transaction.
 *
 * @param {IPrepareWeb2PayloadParams} params - The parameters for the Web2 request.
 * @param {string} params.action - The HTTP method (e.g., "GET", "POST").
 * @param {string} params.url - The URL to send the request to.
 * @param {any[]} params.parameters - Any parameters to be sent with the request.
 * @param {any} params.headers - HTTP headers for the request (optional).
 * @param {number} params.minAttestations - Minimum number of attestations required. Defaults to 2.
 * @param {IKeyPair} keypair - The keypair of the sender.
 * @returns {Promise<Transaction>} A promise that resolves to a signed transaction object.
 */
export async function prepareWeb2Payload(
    params: IPrepareWeb2PayloadParams,
    keypair: IKeyPair,
): Promise<Transaction> {
    required(params, "Invalid params")
    required(params.url, "URL is required")
    required(params.action, "Action not specified")
    required(keypair, "Keypair is required")

    // Generating an empty one and filling it
    const web2_payload: IWeb2Request = skeletons.web2_request
    web2_payload.raw.action = params.action
    web2_payload.raw.url = params.url

    web2_payload.raw.parameters = params.parameters || []
    web2_payload.raw.headers = params.headers || null
    web2_payload.raw.minAttestations = params.minAttestations || 2

    // Ensuring content is a known property
    web2_payload.attestations = new Map()
    web2_payload.hash = ""
    web2_payload.signature = ""
    web2_payload.result = ""

    console.log("[Web2Transactions] Payload:")
    console.log(web2_payload)
    // REVIEW Finish upgrading to the new transaction system
    // Creating a web2 payload
    let web2_tx: Transaction = DemosTransactions.empty()
    // From and To are the same in Web2 transactions
    web2_tx.content.from = keypair.publicKey as Uint8Array
    web2_tx.content.to = web2_tx.content.from
    // Setting the type and data
    web2_tx.content.type = "web2Request"
    web2_tx.content.data = ["web2Request", web2_payload]
    // Producing a timestamp
    web2_tx.content.timestamp = Date.now()
    // Signing the transaction
    web2_tx = await DemosTransactions.sign(web2_tx, keypair)
    // Returning the transaction
    return web2_tx
}
