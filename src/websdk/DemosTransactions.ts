import forge from "node-forge"

import { Demos } from "./demosclass"
import { sha256 } from "./utils/sha256"
import * as skeletons from "./utils/skeletons"

import type { SigningAlgorithm, Transaction } from "@/types"
import type { L2PSHashPayload } from "@/types/blockchain/TransactionSubtypes/L2PSHashTransaction"
import { IKeyPair } from "./types/KeyPair"
import { GCRGeneration } from "./GCRGeneration"
import { _required as required } from "./utils/required"
import { RPCResponse, RPCResponseWithValidityData } from "@/types/communication/rpc"
import { Cryptography } from "@/encryption"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"
import { Enigma } from "@/encryption/PQC/enigma"
import { BroadcastTimeoutError } from "./BroadcastTimeoutError"

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

    /**
     * Broadcast a confirmed transaction and wait for inclusion.
     *
     * Polls the node's `getTransactionStatus` RPC until the tx is observed
     * `included` or `failed`, or until `opts.timeoutMs` elapses (default 30s).
     *
     * Use this when you want a single call with a deterministic outcome.
     * Use plain `broadcast()` when you want to handle async confirmation
     * yourself.
     *
     * On timeout, throws `BroadcastTimeoutError` carrying the tx hash,
     * the last observed state, and the elapsed time so the caller can
     * resume polling.
     *
     * @param validationData - The validity data of the transaction (from `confirm`)
     * @param demos - The demos instance
     * @param opts.timeoutMs - Total time to wait for inclusion. Defaults to 30_000.
     * @param opts.pollIntervalMs - Delay between status polls. Defaults to 500.
     *
     * @returns The original broadcast response and the terminal status.
     */
    broadcastAndWait: async function (
        validationData: RPCResponseWithValidityData,
        demos: Demos,
        opts?: { timeoutMs?: number; pollIntervalMs?: number },
    ): Promise<{
        broadcast: RPCResponse
        status: { state: "included" | "failed"; blockNumber?: number }
    }> {
        const timeout = opts?.timeoutMs ?? 30_000
        const pollInterval = opts?.pollIntervalMs ?? 500

        // Extract the tx hash from the validity data before broadcasting so
        // we can include it in any timeout error.
        const txHash = validationData?.response?.data?.transaction?.hash
        required(txHash, "Could not find transaction hash on validationData")

        // 1. Broadcast first - reuses existing semantics so any failure here
        //    surfaces exactly the same way as a plain broadcast() call.
        const broadcastRes = await DemosTransactions.broadcast(
            validationData,
            demos,
        )

        const start = Date.now()
        let attempt = 0
        let lastState: string = "unknown"

        // 2. Poll until terminal state or timeout. Mirrors KeyServerClient's
        //    pollOAuth pattern: skip the initial sleep on the first attempt
        //    so a tx that lands instantly returns quickly.
        while (Date.now() - start < timeout) {
            attempt++

            if (attempt > 1) {
                await new Promise(r => setTimeout(r, pollInterval))
            }

            const statusRes = await demos.call(
                "nodeCall",
                "",
                { hash: txHash },
                "getTransactionStatus",
            )

            // `Demos.call("nodeCall", ...)` normally returns the inner
            // `response` payload directly (e.g. `{ state, blockNumber? }`).
            // On a terminal transport failure it returns the back-compat
            // envelope `{ result: 500, response: <error> }`. Tolerate that
            // as a transient hiccup and keep polling - we don't want a
            // single 5xx blip to break the wait.
            const isTransportFailureEnvelope =
                statusRes &&
                typeof statusRes === "object" &&
                "result" in statusRes &&
                (statusRes as any).result === 500 &&
                "require_reply" in statusRes

            if (isTransportFailureEnvelope) {
                continue
            }

            const state: string | undefined =
                statusRes && typeof statusRes === "object"
                    ? (statusRes as any).state
                    : undefined

            if (typeof state === "string") {
                lastState = state
                if (state === "included" || state === "failed") {
                    const blockNumber: number | undefined =
                        (statusRes as any).blockNumber
                    return {
                        broadcast: broadcastRes,
                        status: { state, blockNumber },
                    }
                }
            }
        }

        throw new BroadcastTimeoutError({
            txHash,
            lastSeenState: lastState,
            elapsedMs: Date.now() - start,
        })
    },

    /**
     * Create a signed DEMOS transaction to store binary data on the blockchain.
     * Data is stored in the sender's account.
     *
     * @param bytes - The binary data to store (will be base64-encoded)
     * @param demos - The demos instance (for getting the address nonce)
     *
     * @returns The signed storage transaction.
     */
    async store(bytes: Uint8Array, demos: Demos) {
        required(demos.keypair, "Wallet not connected")

        let tx = DemosTransactions.empty()

        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await demos.getAddressNonce(publicKeyHex)

        // Convert bytes to base64 for JSONB compatibility
        const base64Bytes = Buffer.from(bytes).toString('base64')

        tx.content.to = publicKeyHex // Storage is always to the sender's address
        tx.content.nonce = nonce + 1
        tx.content.amount = 0 // Storage transactions don't transfer native tokens
        tx.content.type = "storage"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "storage",
            { bytes: base64Bytes },
        ]

        return await demos.sign(tx)
    },
    
    /**
     * Create a signed L2PS hash update transaction for DTR relay to validators.
     * 
     * L2PS hash updates are self-directed transactions that carry consolidated
     * hash information representing multiple L2PS transactions. These transactions
     * are automatically relayed to validators via DTR (Distributed Transaction Routing)
     * to enable consensus on L2PS network activity without exposing transaction content.
     * 
     * @param l2psUid - The unique identifier of the L2PS network
     * @param consolidatedHash - SHA-256 hash representing all L2PS transactions
     * @param transactionCount - Number of transactions included in this hash update
     * @param demos - The demos instance (for getting the address nonce)
     * 
     * @returns The signed L2PS hash update transaction
     * 
     * @example
     * ```typescript
     * const hashUpdateTx = await DemosTransactions.createL2PSHashUpdate(
     *   "l2ps_network_123",
     *   "0x1234567890abcdef...",
     *   5,
     *   demos
     * )
     * ```
     */
    async createL2PSHashUpdate(
        l2psUid: string,
        consolidatedHash: string,
        transactionCount: number,
        demos: Demos
    ) {
        required(demos.keypair, "Wallet not connected")
        required(l2psUid, "L2PS UID is required")
        required(consolidatedHash, "Consolidated hash is required")
        required(transactionCount >= 0, "Transaction count must be non-negative")

        let tx = DemosTransactions.empty()

        const { publicKey } = await demos.crypto.getIdentity("ed25519")
        const publicKeyHex = uint8ArrayToHex(publicKey as Uint8Array)
        const nonce = await demos.getAddressNonce(publicKeyHex)

        // Self-directed transaction (from = to) triggers DTR routing
        tx.content.to = publicKeyHex
        tx.content.nonce = nonce + 1
        tx.content.amount = 0 // No tokens transferred in hash updates
        tx.content.type = "l2ps_hash_update"
        tx.content.timestamp = Date.now()
        tx.content.data = [
            "l2ps_hash_update",
            {
                l2ps_uid: l2psUid,
                consolidated_hash: consolidatedHash,
                transaction_count: transactionCount,
                timestamp: Date.now()
            } as L2PSHashPayload
        ]

        return await demos.sign(tx)
    },
    
    // NOTE Subnet transactions methods are imported and exposed in demos.ts from the l2ps.ts file.
}
