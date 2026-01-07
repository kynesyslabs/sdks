/* INFO
This library contains all the functions that are used to interact with the demos blockchain.
*/

/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import axios from "axios"
import { Buffer } from "buffer"
import * as skeletons from "./utils/skeletons"

// NOTE Including custom libraries from Demos
import { DemosTransactions } from "./DemosTransactions"
import { DemosWebAuth } from "./DemosWebAuth"
import { prepareXMPayload } from "./XMTransactions"

import { Block, IPeer, RawTransaction, SigningAlgorithm, Transaction, TransactionContent, XMScript } from "@/types"
import { AddressInfo } from "@/types/blockchain/address"
import {
    RPCRequest,
    RPCResponse,
    RPCResponseWithValidityData,
} from "@/types/communication/rpc"
//import { l2psCalls } from "@/l2ps"
import type { IBufferized } from "./types/IBuffer"
import { IKeyPair } from "./types/KeyPair"
import { _required as required } from "./utils/required"
import { web2Calls } from "./Web2Calls"
import { hexToUint8Array, uint8ArrayToHex, UnifiedCrypto } from "@/encryption/unifiedCrypto"
import { GCRGeneration } from "./GCRGeneration"
import { Hashing } from "@/encryption/Hashing"
import * as bip39 from "@scure/bip39"
import { TweetSimplified } from "@/types"
import { GetDiscordMessageResult } from "@/types/web2/discord"
// TLSNotary is dynamically imported to avoid bundling issues with webpack
// The worker.js reference and WASM dependencies break static bundling
import type { TLSNotary, TLSNotaryConfig, TLSNotaryDiscoveryInfo } from "@/tlsnotary"
import { wordList } from "@/encryption/PQC/falconts"

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// TODO WIP modularize this behemoth (see l2psCalls as an example)

/**
 * This class provides methods to interact with the DEMOS blockchain.
 */
export class Demos {
    algorithm: SigningAlgorithm = "ed25519"
    crypto: UnifiedCrypto = null
    private static _instance: Demos | null = null

    /** The RPC URL of the demos node */
    private rpc_url: string = null

    /** Cached TLSNotary instance */
    private _tlsnotaryInstance: TLSNotary | null = null

    /** Connection status of the RPC URL */
    connected: boolean = false
    dual_sign: boolean = false

    /** Connection status of the wallet */
    get walletConnected(): boolean {
        // return this.keypair !== null && this.keypair.privateKey !== null
        return this.crypto && this.keypair != null
    }

    /** The keypair of the connected wallet */
    get keypair() {
        if (!this.crypto) {
            return null
        }

        switch (this.algorithm) {
            case "ed25519":
                return this.crypto.ed25519KeyPair
            case "falcon":
                return this.crypto.enigma.falcon_signing_keypair
            case "ml-dsa":
                return this.crypto.enigma.ml_dsa_signing_keypair
            default:
                throw new Error("Invalid algorithm " + this.algorithm)
        }
    }

    constructor() {
        this.crypto = UnifiedCrypto.getInstance()
    }

    static get instance() {
        if (!Demos._instance) {
            Demos._instance = new Demos()
        }

        return Demos._instance
    }

    /**
     * Generates a new mnemonic.
     *
     * @param strength - The strength of the mnemonic in bits. (128 bits = 12 words, 256 bits = 24 words). Default is 128 bits.
     * @returns The mnemonic
     */
    newMnemonic(strength: 128 | 256 = 128) {
        return bip39.generateMnemonic(wordList, strength)
    }

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
     * Connects to a Demos wallet using the provided master seed.
     *
     * @param masterSeed - The master seed of the wallet
     * @param algorithm - The algorithm to use for the wallet
     * @param options - The options for the wallet connection
     * @param options.algorithm - The algorithm to use for the wallet
     * @param options.dual_sign - Whether to include the ed25519 signature along with the PQC signature, when 
     * signing with unlinked PQC keypairs (i.e. PQC keypairs not linked to your ed25519 address on the network).
     * 
     * @returns The public key of the wallet
     */
    async connectWallet(
        masterSeed: string | Uint8Array,
        options?: {
            algorithm?: SigningAlgorithm,
            /**
             * Whether to include the ed25519 signature along with the PQC signature, when 
             * signing with unlinked PQC keypairs (i.e. PQC keypairs not linked to your ed25519 address on the network).
             */
            dual_sign?: boolean
        },
    ) {
        if (!masterSeed) {
            throw new Error("Master seed is required. Use `demos.newMnemonic()` to generate a new mnemonic.")
        }

        let seed: Uint8Array = null
        this.algorithm = options?.algorithm || "ed25519"
        this.dual_sign = options?.dual_sign || false
        // TODO: Convert masterSeed to 128 bytes

        if (typeof masterSeed !== "string" && !(masterSeed instanceof Uint8Array)) {
            throw new Error("Invalid master seed: must be a string or a Uint8Array")
        }

        let hashable: string | Uint8Array = null

        if (typeof masterSeed === "string") {
            masterSeed = masterSeed.trim()

            if (!bip39.validateMnemonic(masterSeed, wordList)) {
                hashable = bip39.mnemonicToSeedSync(masterSeed)
            } else {
                hashable = masterSeed
            }
        }

        // NOTE: Reverted this bug to keep generating the same keypair
        // with the same mnemonic for mnemonics added to testnet during the incentives campaign.
        // TODO: Put back the "else" when we clear the testnet database.
        /* else */  if (masterSeed.length !== 128) {
            hashable = masterSeed
        }

        if (hashable) {
            const seedHash = Hashing.sha3_512(hashable)
            // remove the 0x prefix
            const seedHashHex = uint8ArrayToHex(seedHash).slice(2)
            seed = new TextEncoder().encode(seedHashHex)
        } else {
            seed = masterSeed as Uint8Array
        }

        // Always generate an ed25519 identity
        if (this.algorithm !== "ed25519") {
            await this.crypto.generateIdentity("ed25519", seed)
        }

        await this.crypto.generateIdentity(this.algorithm, seed)
        return uint8ArrayToHex(this.keypair.publicKey)
    }

    /**
     * Returns the public key of the connected wallet.
     *
     * @returns The public key of the wallet
     */
    getAddress() {
        required(this.walletConnected, "Wallet not connected")
        return uint8ArrayToHex(this.keypair.publicKey)
    }

    /**
     * Returns the ed25519 address of the connected wallet.
     *
     */
    async getEd25519Address() {
        const { publicKey } = await this.crypto.getIdentity("ed25519")
        return uint8ArrayToHex(publicKey as Uint8Array)
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
     * Create a signed DEMOS transaction to send native tokens to a given address.
     *
     * @param to - The reciever
     * @param amount - The amount in DEM
     *
     * @returns The signed transaction.
     */
    pay(to: string, amount: number) {
        required(this.keypair, "Wallet not connected")
        return DemosTransactions.pay(to, amount, this)
    }

    /**
     * Create a signed DEMOS transaction to send native tokens to a given address.
     *
     * @param to - The reciever
     * @param amount - The amount in DEM
     *
     * @returns The signed transaction.
     */
    transfer(to: string, amount: number) {
        required(this.keypair, "Wallet not connected")
        return DemosTransactions.pay(to, amount, this)
    }

    /**
     * Create a signed DEMOS transaction to store binary data on the blockchain.
     * Data is stored in the sender's account.
     *
     * @param bytes - The binary data to store
     * 
     * @returns The signed storage transaction.
     */
    store(bytes: Uint8Array) {
        required(this.keypair, "Wallet not connected")
        return DemosTransactions.store(bytes, this)
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
     * @param options - The dual-signing options
     * @returns The signed transaction
     */
    async sign(raw_tx: Transaction) {
        required(this.keypair, "Wallet not connected")
        if (!raw_tx.content.timestamp || raw_tx.content.timestamp === 0) {
            raw_tx.content.timestamp = Date.now()
        }

        // INFO: Use the connected algorithm's public key as the sender
        raw_tx.content.from = uint8ArrayToHex(this.keypair.publicKey as Uint8Array)

        // INFO: If no ed25519 address is provided, use the connected master seed's ed25519 address
        if (!raw_tx.content.from_ed25519_address) {
            const { publicKey } = await this.crypto.getIdentity("ed25519")
            raw_tx.content.from_ed25519_address = uint8ArrayToHex(publicKey as Uint8Array)
        }

        // INFO: Client-side enforcement of reflexive transactions
        const reflexive: TransactionContent['type'][] = ["identity", "crosschainOperation", "web2Request", "nativeBridge"]

        if (reflexive.includes(raw_tx.content.type)) {
            if (raw_tx.content.from_ed25519_address !== raw_tx.content.to) {
                throw new Error("Transaction of type: " + raw_tx.content.type + " must have the same from and to addresses")
            }
        }

        // INFO: Add 0x prefix to addresses if not present
        if (!raw_tx.content.to.startsWith("0x")) {
            raw_tx.content.to = "0x" + raw_tx.content.to
        }

        const isHex = /^0x[0-9a-f]{64}$/i.test(raw_tx.content.to)
        if (!isHex) {
            throw new Error(`Invalid To address: ${raw_tx.content.to}`)
        }

        if (!raw_tx.content.from_ed25519_address.startsWith("0x")) {
            raw_tx.content.from_ed25519_address = "0x" + raw_tx.content.from_ed25519_address
        }

        if (!raw_tx.content.from.startsWith("0x")) {
            raw_tx.content.from = "0x" + raw_tx.content.from
        }

        raw_tx.content.gcr_edits = await GCRGeneration.generate(raw_tx)

        // We derive the network fee from GCR edits (sum of sender balance removals minus `amount`).
        // This is a pragmatic interim approach; ideally the node should authoritatively return fees
        // to avoid drift between SDK and node logic.
        try {
            raw_tx = this._calculateAndApplyGasFee(raw_tx)
        } catch (e) {
            // Non-fatal: if fee derivation fails, continue without modifying fees
            console.warn("[demos] fee derivation skipped:", e)
        }

        raw_tx.hash = Hashing.sha256(JSON.stringify(raw_tx.content))
        const signature = await this.crypto.sign(
            this.algorithm,
            new TextEncoder().encode(raw_tx.hash),
        )

        // INFO: We only dual-sign when signing with PQC keypairs
        let dual_sign = this.dual_sign && this.algorithm !== "ed25519"

        if (dual_sign) {
            const ed25519_signature = await this.crypto.sign(
                "ed25519",
                new TextEncoder().encode(raw_tx.hash),
            )
            raw_tx.ed25519_signature = uint8ArrayToHex(ed25519_signature.signature)
        }

        raw_tx.signature = {
            type: this.algorithm,
            data: uint8ArrayToHex(signature.signature),
        }

        return raw_tx
    }

    /**
     * Signs a message.
     *
     * @param message - The message to sign
     * @param options - The options for the message signing
     * @param options.algorithm - The algorithm to use for the message signing. Defaults to the connected wallet's algorithm.
     * @returns The signature of the message
     */
    async signMessage(message: string | Buffer, options?: { algorithm?: SigningAlgorithm }): Promise<{ type: SigningAlgorithm, data: string }> {
        const algorithm = options?.algorithm || this.algorithm

        const keypair = await this.crypto.getIdentity(algorithm)

        if (!keypair) {
            await this.crypto.generateIdentity(algorithm)
        }

        let messageBuffer: Uint8Array = null
        if (typeof message === "string") {
            messageBuffer = new TextEncoder().encode(message)
        } else {
            messageBuffer = message
        }

        const signature = await this.crypto.sign(
            algorithm,
            messageBuffer,
        )

        return { type: algorithm, data: uint8ArrayToHex(signature.signature) }
    }

    /**
     * Verifies a message.
     *
     * @param message - The message to verify
     * @param signature - The signature of the message
     * @param publicKey - The public key of the message
     * @param options - The options for the message verification
     * @param options.algorithm - The algorithm to use for the message verification. Defaults to the connected wallet's algorithm or ed25519 if no wallet is connected.
     * 
     * @returns Whether the message is verified
     */
    async verifyMessage(message: string | Buffer, signature: string, publicKey: string, options?: { algorithm?: SigningAlgorithm }): Promise<boolean> {
        const algorithm = options?.algorithm || this.algorithm

        let messageBuffer: Uint8Array = null
        if (typeof message === "string") {
            messageBuffer = new TextEncoder().encode(message)
        } else {
            messageBuffer = message
        }

        const verified = await this.crypto.verify({
            algorithm: algorithm,
            signature: hexToUint8Array(signature),
            publicKey: hexToUint8Array(publicKey),
            message: messageBuffer,
        })

        return verified
    }

    /**
     * @private
     * Calculates and applies the gas fee for a transaction (SDK-level fallback).
     * NOTE: We infer the fee by analyzing the generated GCR (Gas Consumption Record) edits:
     * - Sum all "balance" edits with operation "remove" for the sender
     * - Subtract the declared transaction `amount`
     * The remainder is treated as the network fee. If a fee already exists on the tx, we only raise
     * `network_fee` if the newly inferred fee is higher (prevents double-charging on re-sign).
     * This is an interim approach; the preferred design is for the node to return fees explicitly.
     *
     * @param raw_tx - The transaction for which to calculate the fee.
     * @returns The updated transaction with the fee applied.
     */
    private _calculateAndApplyGasFee(raw_tx: Transaction): Transaction {
        const edits = raw_tx.content.gcr_edits
        if (!Array.isArray(edits)) {
            // Fail silently: don’t block signing if GCR edits aren’t available
            return raw_tx
        }

        // INFO: The gas fee is calculated by summing up all "remove" balance edits for the sender's account
        // and then subtracting the actual transaction amount. This gives the value of the fee.
        const sender = (raw_tx.content.from_ed25519_address ?? "").toLowerCase()
        const totalRemoved = edits.reduce((sum, edit: any) => {
            try {
                if (
                    edit.type === "balance" &&
                    edit.operation === "remove" &&
                    typeof edit.account === "string" &&
                    edit.account.toLowerCase() === sender
                ) {
                    const amt = Number(edit.amount)
                    return sum + (Number.isFinite(amt) ? amt : 0)
                }
            } catch {
                // skip malformed entries
            }
            return sum
        }, 0)

        const txAmt = Number(raw_tx.content.amount ?? 0)
        const calculatedFee = Math.max(totalRemoved - (Number.isFinite(txAmt) ? txAmt : 0), 0)

        // INFO: This logic handles both initial fee creation and accumulation for re-signed transactions.
        // To avoid fee accumulation, a new transaction object should be created for each signing.
        const existing = raw_tx.content.transaction_fee ?? { network_fee: 0, rpc_fee: 0, additional_fee: 0 }
        const totalExisting =
            (Number(existing.network_fee) || 0) +
            (Number(existing.rpc_fee) || 0) +
            (Number(existing.additional_fee) || 0)

        // Only set the fee if no fees are already applied
        if (totalExisting === 0) {
            raw_tx.content.transaction_fee = {
                network_fee: calculatedFee,
                rpc_fee: 0,
                additional_fee: 0,
            }
        }
        return raw_tx
    }

    // L2PS calls are defined here

    async rpcCall(
        request: RPCRequest,
        isAuthenticated: boolean = false,
        retries = 0,
        sleepTime = 250,
        allowedErrorCodes: number[] = [],
    ): Promise<RPCResponse> {
        let publicKey = ""
        let signature = ""

        if (isAuthenticated) {
            publicKey = uint8ArrayToHex(this.keypair.publicKey)
            const _signature = await this.crypto.sign(
                this.algorithm,
                new TextEncoder().encode(publicKey),
            )
            signature = uint8ArrayToHex(_signature.signature)
        }

        try {
            const response = await axios.post<RPCResponse>(
                this.rpc_url,
                request,
                {
                    headers: {
                        "Content-Type": "application/json",
                        identity: this.algorithm + ":" + publicKey,
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

            return response.data
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

            const publicKey = uint8ArrayToHex(this.keypair.publicKey)
            const signature = await this.crypto.sign(
                this.algorithm,
                new TextEncoder().encode(publicKey),
            )

            pubkey_string = this.algorithm + ":" + publicKey
            pubkey_signature = uint8ArrayToHex(signature.signature)
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
    async getLastBlockNumber(): Promise<number> {
        return (await this.nodeCall("getLastBlockNumber")) as number
    }

    /**
     * Get the last block hash.
     */
    async getLastBlockHash(): Promise<string | null> {
        return (await this.nodeCall("getLastBlockHash")) as string
    }

    /**
     * Get list of blocks.
     *
     */
    async getBlocks(
        start?: number | "latest",
        limit?: number,
    ): Promise<Block[]> {
        return await this.nodeCall("getBlocks", { start, limit })
    }

    /**
     * Get block by number.
     *
     * @param blockNumber - The block number
     */
    async getBlockByNumber(blockNumber: number): Promise<Block> {
        return await this.nodeCall("getBlockByNumber", {
            blockNumber,
        })
    }

    /**
     * Get block by hash.
     *
     * @param blockHash - The block hash
     */
    async getBlockByHash(blockHash: string): Promise<Block> {
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
    ): Promise<Transaction> {
        // Defaulting to the genesis tx
        return await this.nodeCall("getTxByHash", {
            hash: txHash,
        })
    }

    /**
     * @deprecated
     * Use `demos.getTransactions()` instead
     *
     * Get all transactions.
     */
    async getAllTxs(): Promise<RawTransaction[]> {
        return await this.getTransactions("latest", 50)
    }

    /**
     * Get the transaction history of an address.
     *
     * @param address - The address
     * @param type - The type of transaction. Defaults to "all".
     * @param start - The start index. Defaults to 0.
     * @param limit - The number of transactions to return. Defaults to 100.
     *
     * @returns A list of transaction ordered from the most recent to the oldest.
     */
    async getTransactionHistory(address: string, type: TransactionContent["type"] | "all" = "all", options: { start?: number, limit?: number } = {}): Promise<Transaction[]> {
        return await this.nodeCall("getTransactionHistory", { address, type, ...options })
    }

    /**
     * Get all transactions.
     */
    async getTransactions(
        start?: number | "latest",
        limit?: number,
    ): Promise<RawTransaction[]> {
        return await this.nodeCall("getTransactions", { start, limit })
    }

    /**
     * Get the peerlist.
     */
    async getPeerlist(): Promise<IPeer[]> {
        // TODO: Implement Peerlist type
        return await this.nodeCall("getPeerlist")
    }

    /**
     * Get the mempool.
     */
    async getMempool(): Promise<Transaction[]> {
        return await this.nodeCall("getMempool")
    }

    /**
     * Get the identity of the connected RPC.
     */
    async getPeerIdentity(): Promise<string> {
        return await this.nodeCall("getPeerIdentity")
    }

    /**
     * Get information about an address.
     *
     * @param address - The address
     */
    async getAddressInfo(address: string): Promise<AddressInfo | null> {
        const info = await this.nodeCall("getAddressInfo", {
            address,
        })

        if (info) {
            // REVIEW Fix for when the balance is 0 (see FIXME below)
            if (!info.balance) {
                info.balance = 0
            }
            return {
                ...info,
                balance: BigInt(info.balance), // FIXME This fails when the balance is 0
            } as AddressInfo
        }

        return null
    }

    /**
     * Get address nonce.
     *
     * @param address - The address
     */
    async getAddressNonce(address: string): Promise<number> {
        const nonce = await this.nodeCall("getAddressNonce", {
            address,
        })

        if (nonce) {
            return nonce as number
        }

        return 0
    }

    /**
     * Disconnects from the RPC URL and the wallet.
     */
    disconnect() {
        // remove rpc_url and wallet connection
        this.rpc_url = null
        this.dual_sign = false
        // this.keypair = null

        this.connected = false
        this.crypto = null
        this.algorithm = "ed25519"
    }

    // ANCHOR TLSNotary
    /**
     * Create a TLSNotary instance for HTTPS attestation.
     *
     * This method discovers the notary endpoints from the connected node
     * and returns an initialized TLSNotary instance.
     *
     * @param config - Optional explicit configuration (overrides discovery)
     * @returns Initialized TLSNotary instance
     *
     * @example
     * ```typescript
     * // Option 1: Auto-discovery from connected node (preferred)
     * const demos = new Demos({ rpc: 'https://node.demos.sh' });
     * await demos.connect();
     * const tlsn = await demos.tlsnotary();
     *
     * // Option 2: Explicit configuration
     * const tlsn = await demos.tlsnotary({
     *   notaryUrl: 'wss://other-node.demos.sh:7047',
     *   websocketProxyUrl: 'wss://other-node.demos.sh:55688',
     * });
     *
     * // Attest an HTTPS request
     * const result = await tlsn.attest({
     *   url: 'https://api.github.com/users/octocat',
     * });
     * console.log('Verified server:', result.verification.serverName);
     * ```
     */
    async tlsnotary(config?: TLSNotaryConfig): Promise<TLSNotary> {
        // Return cached instance if available and no explicit config provided
        if (!config && this._tlsnotaryInstance) {
            if (!this._tlsnotaryInstance.isInitialized()) {
                await this._tlsnotaryInstance.initialize()
            }
            return this._tlsnotaryInstance
        }

        // Dynamic import to avoid bundling issues with webpack
        // The TLSNotary class uses Web Workers and WASM which require runtime loading
        const { TLSNotary } = await import("@/tlsnotary")

        let tlsnConfig: TLSNotaryConfig

        if (config) {
            // Use explicit configuration (don't cache explicit configs)
            tlsnConfig = config
        } else {
            // Discover endpoints from node
            if (!this.connected) {
                throw new Error(
                    "Not connected to a node. Either connect first or provide explicit TLSNotary config.",
                )
            }

            const info = (await this.nodeCall("tlsnotary.getInfo")) as TLSNotaryDiscoveryInfo

            if (!info || !info.notaryUrl) {
                throw new Error(
                    "Node does not support TLSNotary or tlsnotary.getInfo failed. " +
                        "Provide explicit config or use a node with TLSNotary enabled.",
                )
            }

            tlsnConfig = {
                notaryUrl: info.notaryUrl,
                rpcUrl: this.rpc_url,
                notaryPublicKey: info.publicKey,
                // Note: websocketProxyUrl is deprecated - proxies are now requested dynamically
            }
        }

        const tlsn = new TLSNotary(tlsnConfig)
        await tlsn.initialize()

        // Cache the instance only when using discovery (no explicit config)
        if (!config) {
            this._tlsnotaryInstance = tlsn
        }

        return tlsn
    }

    // ANCHOR Web2 Endpoints
    web2 = {
        ...web2Calls,
        createDahr: async () => {
            return await web2Calls.createDahr(this)
        },
        getTweet: async (tweetUrl: string): Promise<{ success: boolean, tweet: TweetSimplified, error?: string }> => {
            return await this.nodeCall("getTweet", {
                tweetUrl,
            })
        },
        getDiscordMessage: async (discordUrl: string): Promise<{ success: boolean, message: GetDiscordMessageResult, error?: string }> => {
            return await this.nodeCall("getDiscordMessage", {
                discordUrl,
            })
        }
    }

    // REVIEW: Phase 9 - IPFS cost estimation endpoints
    // ANCHOR IPFS Endpoints
    ipfs = {
        /**
         * Get a cost quote for an IPFS operation without submitting a transaction.
         *
         * Use this to estimate costs and populate custom_charges before signing.
         * The returned cost should be used as max_cost_dem in the transaction's
         * custom_charges field.
         *
         * @param fileSizeBytes - Size of file in bytes
         * @param operation - IPFS operation type ('IPFS_ADD', 'IPFS_PIN', or 'IPFS_UNPIN')
         * @param durationBlocks - Optional duration in blocks (for PIN operations)
         * @returns Cost quote with detailed breakdown
         *
         * @example
         * ```typescript
         * // Get quote for add operation
         * const quote = await demos.ipfs.quote(content.length, 'IPFS_ADD')
         * console.log(`Cost: ${quote.cost_dem} DEM`)
         *
         * // Use quote to build transaction with cost control
         * const payload = IPFSOperations.createAddPayload(content, {
         *   customCharges: IPFSOperations.quoteToCustomCharges(quote)
         * })
         * ```
         */
        quote: async (
            fileSizeBytes: number,
            operation: "IPFS_ADD" | "IPFS_PIN" | "IPFS_UNPIN" = "IPFS_ADD",
            durationBlocks?: number,
        ): Promise<{
            cost_dem: string
            file_size_bytes: number
            is_genesis: boolean
            breakdown: {
                base_cost: string
                size_cost: string
                free_tier_bytes: number
                chargeable_bytes: number
            }
            operation: string
        }> => {
            return await this.nodeCall("ipfsQuote", {
                file_size_bytes: fileSizeBytes,
                operation,
                duration_blocks: durationBlocks,
            })
        },
    }

    xm = {
        // INFO Working with XMTransactions
        createPayload: (xm_payload: XMScript, keypair?: IKeyPair) => {
            const usedKeypair = keypair || this.keypair
            if (!usedKeypair) {
                throw new Error("No keypair provided and no wallet connected")
            }
            return prepareXMPayload(xm_payload, this)
        },
    }

    tx = {
        ...DemosTransactions,
        /**
         * Same as `demos.sign`.
         * Signs a transaction after hashing its content.
         *
         * @param raw_tx - The transaction to be signed.
         */
        sign: (
            raw_tx: Transaction,
        ) => {
            return this.sign(raw_tx)
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
    //l2ps = l2psCalls
}
