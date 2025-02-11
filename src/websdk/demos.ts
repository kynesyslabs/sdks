/* INFO
This library contains all the functions that are used to interact with the demos blockchain.
*/

/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import axios from "axios"
import { Buffer } from "buffer/"
import * as skeletons from "./utils/skeletons"

// NOTE Including custom libraries from Demos
import { DemosTransactions } from "./DemosTransactions"
import { DemosWebAuth } from "./DemosWebAuth"
import { prepareXMPayload } from "./XMTransactions"

import { Cryptography } from "@/encryption/Cryptography"
import type { Transaction, XMScript } from "@/types"
import {
    RPCRequest,
    RPCResponse,
    RPCResponseWithValidityData,
} from "@/types/communication/rpc"

import { l2psCalls } from "@/l2ps"
import type { IBufferized } from "./types/IBuffer"
import { IKeyPair } from "./types/KeyPair"
import { _required as required } from "./utils/required"
import { web2Calls } from "./Web2Calls"

// TODO WIP modularize this behemoth (see l2psCalls as an example)
/**
 * @deprecated Use the new `Demos` class
 * @see Demos class
 *
 * ```ts
 * import { Demos } from "@kynesyslabs/websdk"
 * const demos = new Demos()
 *
 * await demos.connect(rpc_url)
 * await demos.connectWallet(privateKey)
 * ```
 */
export const demos = {
    // ANCHOR Properties
    rpc_url: <string | null>null,
    connected: false,
    get walletConnected(): boolean {
        return this.keypair !== null && this.keypair.privateKey !== null
    },
    keypair: <IKeyPair>null,

    // SECTION Connection and listeners
    connect: async function (rpc_url: string) {
        const response = await axios.get(rpc_url)

        if (response.status == 200) {
            demos.rpc_url = rpc_url
        }

        demos.connected = true
        return demos.connected
    },

    connectWallet: async function (
        privateKey: string | Buffer | Uint8Array,
        options?: {
            /**
             * Whether the private key is a seed.
             * If true, the seed will be converted to an ed25519 keypair.
             */
            isSeed?: boolean
        },
    ) {
        if (options?.isSeed) {
            privateKey = Cryptography.newFromSeed(privateKey).privateKey
        }

        const webAuthInstance = new DemosWebAuth()
        const [loggedIn, helptext] = await webAuthInstance.login(privateKey)

        if (loggedIn) {
            demos.keypair = webAuthInstance.keypair
            return demos.keypair.publicKey.toString("hex")
        }

        throw new Error(helptext)
    },

    getAddress: function () {
        required(demos.walletConnected, "Wallet not connected")
        return demos.keypair.publicKey.toString("hex")
    },

    disconnect: function () {
        // remove rpc_url and wallet connection
        demos.rpc_url = null
        demos.keypair = null

        demos.connected = false
    },
    // !SECTION Connection and listeners

    // INFO MUID generator
    generateMuid: function () {
        const number_1 =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        const number_2 =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        const muid = number_1 + number_2
        return muid
    },

    // SECTION Transaction methods
    // NOTE These methods comes all from DemosTransactions.ts. If possible, we should use a tx: DemosTransactions object to ensure consistency
    sign: (tx: Transaction) => {
        return DemosTransactions.sign(tx, demos.keypair)
    },
    // REVIEW: Replace call with validate / execute logic
    confirm: (tx: Transaction) => {
        // @ts-expect-error
        return DemosTransactions.confirm(tx, demos)
    },
    broadcast: (validityData: RPCResponseWithValidityData) => {
        // @ts-expect-error
        return DemosTransactions.broadcast(validityData, demos)
    },

    /**  NOTE Subnet / L2PS EncryptedTransaction should be handled in the same way as the other txs
     * See l2psCalls.prepare(tx, subnet) to see how to prepare a SubnetPayload
     */

    // L2PS calls are defined here
    l2ps: l2psCalls,
    // !SECTION Transaction methods

    // SECTION NodeCall prototype
    // INFO NodeCalls use the same structure
    nodeCall: async function (message: any, args = {}) {
        return await demos.call("nodeCall", message, args)
    },
    // INFO NodeCalls use the same structure
    call: async function (
        method: any,
        message: any,
        data: any = {},
        extra: any = "",
        sender: any = null,
        receiver: any = null,
    ) {
        // NOTE: Didn't tear apart the transmission object during the http
        // rewrite just in case we need to come back to it.
        const transmission = {
            bundle: {
                content: {
                    type: method,
                    message: message,
                    sender: <Buffer | IBufferized | null>null,
                    receiver: null,
                    timestamp: null,
                    data: data, // REVIEW Does it works this way or should we pass it as a non-dict argument?
                    extra: extra,
                },
                hash: "",
                signature: <IBufferized | null>null,
            },
        }

        const request: RPCRequest = {
            method: method,
            params: [transmission.bundle.content],
        }

        let pubkey_string: string
        let pubkey_signature: string
        let isAuthenticated: boolean = method !== "nodeCall"

        if (isAuthenticated) {
            if (!demos.walletConnected) {
                throw new Error(
                    "Error: Wallet not connected! Please connect a private key using demos.connectWallet(privateKey) or provide one via the privateKey parameter",
                )
            }

            pubkey_string = demos.keypair.publicKey.toString("hex")
            pubkey_signature = Cryptography.sign(
                pubkey_string,
                demos.keypair.privateKey,
            ).toString("hex")
        }

        try {
            const response = await axios.post<RPCResponse>(
                demos.rpc_url,
                request,
                {
                    headers: {
                        "Content-Type": "application/json",
                        identity: pubkey_string,
                        signature: pubkey_signature,
                    },
                },
            )

            if (method == "nodeCall") {
                return response.data.response
            }

            return response.data
        } catch (error) {
            return {
                result: 500,
                response: error,
                require_reply: false,
                extra: null,
            } as RPCResponse
        }
    },
    // !SECTION NodeCall prototype

    // SECTION Predefined calls
    getLastBlockNumber: async function () {
        return (await demos.nodeCall("getLastBlockNumber")) as number
    },
    getLastBlockHash: async function () {
        return (await demos.nodeCall("getLastBlockHash")) as string
    },
    getBlockByNumber: async function (blockNumber: any) {
        return await demos.nodeCall("getBlockByNumber", {
            blockNumber,
        })
    },
    getBlockByHash: async function (blockHash: any) {
        return await demos.nodeCall("getBlockByHash", {
            hash: blockHash,
        })
    },

    getTxByHash: async function (
        txHash = "e25860ec6a7cccff0371091fed3a4c6839b1231ccec8cf2cb36eca3533af8f11",
    ) {
        // Defaulting to the genesis tx of course
        return await demos.nodeCall("getTxByHash", {
            hash: txHash,
        })
    },
    getAllTxs: async function () {
        return await demos.nodeCall("getAllTxs")
    },

    getPeerlist: async function () {
        return await demos.nodeCall("getPeerlist")
    },
    getMempool: async function () {
        return await demos.nodeCall("getMempool")
    },
    getPeerIdentity: async function () {
        return await demos.nodeCall("getPeerIdentity")
    },

    getAddressInfo: async function (address: any) {
        return await demos.nodeCall("getAddressInfo", {
            address,
        })
    },
    // !SECTION Predefined calls

    // SECTION Operation types
    /* NOTE
     * As per the new transaction system, we need to prepare the payload before sending it to the network.
     * This is done by calling the createPayload method of the corresponding transaction type.
     * You will get a Transaction object, signed and ready to be broadcasted using DemosTransactions.broadcast.
     * After broadcasting, you will receive a ValidityData object that needs to be confirmed.
     * This is done by calling the confirm method of DemosTransactions.
     */
    // ANCHOR Web2 Endpoints
    web2: {
        ...web2Calls,
    },
    // ANCHOR Crosschain support endpoints
    xm: {
        // INFO Working with XMTransactions
        createPayload: (xm_payload: XMScript, keypair?: IKeyPair) => {
            const usedKeypair = keypair || demos.keypair
            if (!usedKeypair) {
                throw new Error("No keypair provided and no wallet connected")
            }
            return prepareXMPayload(xm_payload, usedKeypair)
        },
    },
    tx: {
        ...DemosTransactions,
        /**
         * Signs a transaction after hashing its content.
         *
         * @param raw_tx - The transaction to be signed.
         * @param keypair - The keypair to use for signing. If not provided, the keypair connected to the wallet will be used.
         * @returns A Promise that resolves to the signed transaction.
         */
        sign: (raw_tx: Transaction, keypair?: IKeyPair) => {
            const usedKeypair = keypair || demos.keypair
            if (!usedKeypair) {
                throw new Error("No keypair provided and no wallet connected")
            }
            return DemosTransactions.sign(raw_tx, usedKeypair)
        },
    },

    // ANCHOR Supporting txs
    // REVIEW: These two are deprecated, in favor of `demos.tx` (but kept to avoid breaking references)
    DemosTransactions,
    transactions: DemosTransactions,

    // !SECTION Operation types

    // INFO DemosWebAuthenticator
    DemosWebAuth, // NOTE Modularized to be more elegant

    // INFO Calling demos.skeletons.NAME provides an empty skeleton that can be used for reference while calling other demos functions
    skeletons,
}
