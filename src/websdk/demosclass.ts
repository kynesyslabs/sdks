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
import {
    IPrepareWeb2PayloadParams,
    prepareWeb2Payload,
} from "./Web2Transactions"
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

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// TODO WIP modularize this behemoth (see l2psCalls as an example)

/**
 * This class provides methods to interact with the DEMOS blockchain.
 */
export class Demos {
    /** The RPC URL of the demos node */
    rpc_url: string | null = null

    /** Connection status of the RPC URL */
    connected: boolean = false

    /** Connection status of the wallet */
    get walletConnected(): boolean {
        return this.keypair !== null && this.keypair.privateKey !== null
    }

    /** The keypair of the connected wallet */
    keypair: IKeyPair | null = null

    /**
     * Connects to a RPC URL. Throws an error if the connection fails.
     *
     * @param rpc_url - The URL of the demos node
     * @returns Whether the connection was successful
     */
    async connect(rpc_url: string) {
        const response = await axios.get(rpc_url)

        if (response.status == 200) {
            this.rpc_url = rpc_url
        }

        this.connected = true
        return this.connected
    }

    /**
     * Connects to a Demos wallet using the provided private key.
     *
     * @param privateKey - The private key of the wallet
     * @param options - The options for the wallet connection
     * @returns The public key of the wallet
     */
    async connectWallet(
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
            this.keypair = webAuthInstance.keypair
            return this.keypair.publicKey.toString("hex")
        }

        throw new Error(helptext)
    }

    /**
     * Returns the public key of the connected wallet.
     *
     * @returns The public key of the wallet
     */
    getAddress() {
        required(this.walletConnected, "Wallet not connected")
        return this.keypair.publicKey.toString("hex")
    }

    // !SECTION Connection and listeners

    /**
     * Generates a random MUID.
     *
     * @returns The MUID
     */
    generateMuid() {
        const number_1 =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        const number_2 =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        const muid = number_1 + number_2
        return muid
    }

    /**
     * Confirms a transaction.
     *
     * @param transaction - The transaction to confirm
     * @returns The validity data of the transaction containing the gas information.
     */
    confirm(transaction: Transaction) {
        return DemosTransactions.confirm(transaction, this)
    }

    /**
     * Broadcasts a transaction for execution.
     *
     * @param validationData - The validity data of the transaction
     * @returns The response from the node
     */
    broadcast(validationData: RPCResponseWithValidityData) {
        return DemosTransactions.broadcast(validationData, this)
    }

    /**
     * Signs a transaction.
     *
     * @param raw_tx - The transaction to sign
     * @returns The signed transaction
     */
    sign(raw_tx: Transaction) {
        return DemosTransactions.sign(raw_tx, this.keypair)
    }

    // L2PS calls are defined here

    async rpcCall(
        request: RPCRequest,
        isAuthenticated: boolean = false,
        retries = 1,
        sleepTime = 250,
        allowedErrorCodes: number[] = [],
    ) {
        let publicKey = ""
        let signature = ""

        if (isAuthenticated) {
            publicKey = this.keypair.publicKey.toString("hex")
            signature = Cryptography.sign(
                publicKey,
                this.keypair.privateKey,
            ).toString("hex")
        }

        try {
            const response = await axios.post<RPCResponse>(
                this.rpc_url,
                request,
                {
                    headers: {
                        "Content-Type": "application/json",
                        identity: publicKey,
                        signature: signature,
                    },
                },
            )

            if (
                response.data.result == 200 ||
                allowedErrorCodes.includes(response.data.result)
            ) {
                return response.data
            }

            if (retries > 0) {
                await sleep(sleepTime)
                return await this.rpcCall(
                    request,
                    isAuthenticated,
                    retries - 1,
                    sleepTime,
                    allowedErrorCodes,
                )
            }
        } catch (error) {
            console.error(error)
            return {
                result: 500,
                response: error,
                require_reply: false,
                extra: null,
            } as RPCResponse
        }
    }

    // INFO NodeCalls use the same structure
    async call(
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
            if (!this.walletConnected) {
                throw new Error(
                    "Error: Wallet not connected! Please connect a private key using demos.connectWallet(privateKey) or provide one via the privateKey parameter",
                )
            }

            pubkey_string = this.keypair.publicKey.toString("hex")
            pubkey_signature = Cryptography.sign(
                pubkey_string,
                this.keypair.privateKey,
            ).toString("hex")
        }

        try {
            const response = await axios.post<RPCResponse>(
                this.rpc_url,
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
    }

    // SECTION: NODECALLS

    /**
     * Performs a nodeCall on the connected RPC.
     *
     * @param message - The message to send to the node
     * @param args - The arguments to send to the node
     *
     * @returns The nodeCall response
     */
    async nodeCall(message: any, args = {}) {
        return this.call("nodeCall", message, args)
    }

    // SECTION Predefined nodeCall methods

    /**
     * Get the last block number.
     */
    async getLastBlockNumber() {
        return (await this.nodeCall("getLastBlockNumber")) as number
    }

    /**
     * Get the last block hash.
     */
    async getLastBlockHash() {
        return (await this.nodeCall("getLastBlockHash")) as string
    }

    /**
     * Get block by number.
     *
     * @param blockNumber - The block number
     */
    async getBlockByNumber(blockNumber: any) {
        return await this.nodeCall("getBlockByNumber", {
            blockNumber,
        })
    }

    /**
     * Get block by hash.
     *
     * @param blockHash - The block hash
     */
    async getBlockByHash(blockHash: any) {
        return await this.nodeCall("getBlockByHash", {
            hash: blockHash,
        })
    }

    /**
     * Get transaction by hash.
     *
     * @param txHash - The transaction hash
     */
    async getTxByHash(
        txHash = "e25860ec6a7cccff0371091fed3a4c6839b1231ccec8cf2cb36eca3533af8f11",
    ) {
        // Defaulting to the genesis tx
        return await this.nodeCall("getTxByHash", {
            hash: txHash,
        })
    }

    /**
     * Get all transactions.
     */
    async getAllTxs(): Promise<Transaction[]> {
        return await this.nodeCall("getAllTxs")
    }

    /**
     * Get the peerlist.
     */
    async getPeerlist() {
        // TODO: Implement Peerlist type
        return await this.nodeCall("getPeerlist")
    }

    /**
     * Get the mempool.
     */
    async getMempool() {
        return await this.nodeCall("getMempool")
    }

    /**
     * Get the identity of the connected RPC.
     */
    async getPeerIdentity() {
        return await this.nodeCall("getPeerIdentity")
    }

    /**
     * Get information about an address.
     *
     * @param address - The address
     */
    async getAddressInfo(address: any) {
        return await this.nodeCall("getAddressInfo", {
            address,
        })
    }

    /**
     * Disconnects from the RPC URL and the wallet.
     */
    disconnect() {
        // remove rpc_url and wallet connection
        this.rpc_url = null
        this.keypair = null

        this.connected = false
    }

    // ANCHOR Web2 Endpoints
    web2 = {
        ...web2Calls,
        legacy: {
            createPayload: (
                params: IPrepareWeb2PayloadParams,
                keypair?: IKeyPair,
            ) => {
                const usedKeypair = keypair || this.keypair

                if (!usedKeypair) {
                    throw new Error(
                        "No keypair provided and no wallet connected",
                    )
                }

                return prepareWeb2Payload(params, usedKeypair)
            },
        },
    }

    xm = {
        // INFO Working with XMTransactions
        createPayload: (xm_payload: XMScript, keypair?: IKeyPair) => {
            const usedKeypair = keypair || this.keypair
            if (!usedKeypair) {
                throw new Error("No keypair provided and no wallet connected")
            }
            return prepareXMPayload(xm_payload, usedKeypair)
        },
    }

    tx = {
        ...DemosTransactions,
        /**
         * Signs a transaction after hashing its content.
         *
         * @param raw_tx - The transaction to be signed.
         * @param keypair - The keypair to use for signing. If not provided, the keypair connected to the wallet will be used.
         * @returns A Promise that resolves to the signed transaction.
         */
        sign: (raw_tx: Transaction, keypair?: IKeyPair) => {
            const usedKeypair = keypair || this.keypair
            if (!usedKeypair) {
                throw new Error("No keypair provided and no wallet connected")
            }
            return DemosTransactions.sign(raw_tx, usedKeypair)
        },
    }

    // ANCHOR Supporting txs
    // REVIEW: These two are deprecated, in favor of `demos.tx` (but kept to avoid breaking references)
    DemosTransactions = DemosTransactions
    transactions = DemosTransactions
    // INFO DemosWebAuthenticator
    DemosWebAuth = DemosWebAuth

    // INFO Calling demos.skeletons.NAME provides an empty skeleton that can be used for reference while calling other demos functions
    skeletons = skeletons
    l2ps = l2psCalls
}
