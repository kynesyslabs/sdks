/* INFO
This library contains all the functions that are used to interact with the demos blockchain.
*/

/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import { Buffer } from 'buffer/'
import forge from 'node-forge'
import io, { Socket } from 'socket.io-client'

import { sha256 } from './utils/sha256'
import { bufferize } from './utils/bufferizer'
import * as skeletons from './utils/skeletons'

// NOTE Including custom libraries from Demos
import { DemosWebAuth } from './DemosWebAuth'
import { prepareXMPayload } from './XMTransactions'
import { DemosTransactions } from './DemosTransactions'
import { prepareWeb2Payload } from './Web2Transactions'

import type { IBufferized } from './types/IBuffer'
import type { Transaction, ValidityData } from '@/types'

// TODO Use XMTransactions for the crosschain transactions

// REVIEW Maybe modularize this behemoth
export const demos = {
    // ANCHOR Properties
    socket: <Socket | null>null,
    socket_connected: false,
    connectedListener: function (val: any) {},
    set connected(val) {
        this.socket_connected = val
        this.connectedListener(val)
    },
    get connected() {
        return this.socket_connected
    },
    onConnectedChange: function (listener: any) {
        this.connectedListener = listener
    },
    identity: null,
    registry: <
        {
            [key: string]: any
        }
    >{},

    // SECTION Registry
    replies: {
        // INFO Insert a muid in the reply registry
        waitReply: function (muid: string) {
            if (!demos.registry[muid]) {
                demos.registry[muid] = null
                console.log('[DEMOS] Waiting for response for ' + muid)
                console.log(demos.registry)
            }
        },

        // INFO Check if a muid is in the registry
        needReply: function (muid: string | number) {
            if (demos.registry[muid] === undefined) {
                return false
            } else {
                return true
            }
        },

        // INFO Get a reply from a muid
        getReply: function (muid: string | number) {
            return demos.registry[muid]
        },

        // NOTE As this method returns a promise, we can use it to asynchronously await for a reply
        checkReply: async function (muid: any, ms = 10000) {
            let timeout = ms // 5 seconds
            let reply = demos.replies.getReply(muid)
            while (reply === null && timeout > 0) {
                await new Promise((resolve) => setTimeout(resolve, 100))
                reply = demos.replies.getReply(muid)
                timeout -= 100
            }
            if (reply === null) {
                reply = JSON.stringify({ error: 'timeout' })
            }
            return reply
        },
    },
    // !SECTION Registry

    // SECTION Connection and listeners
    connect: function (rpc_url: string) {
        if (this.socket !== null) {
            console.log('[DEMOS] Already connected')
            return
        }
        // @ts-ignore
        try {
            demos.socket = io(rpc_url, {
                extraHeaders: {
                    'Access-Control-Allow-Origin': '*',
                },
            })
        } catch (e) {
            this.connected = false
            console.log(e)
        }

        if (demos.socket === null) {
            throw new Error('Socket is null! Aborting connection')
        }

        // Listeners
        demos.socket.on('connect', function () {
            console.log('[DEMOS] Connected to server', demos.socket!.connected)
            demos.connected = demos.socket!.connected
        })

        demos.socket.once('disconnect', function () {
            console.log('[DEMOS] Disconnected from server')
            demos.socket = null
            demos.connected = false
        })

        // NOTE Reply to comlink messages
        demos.socket.on(
            'comlink_reply',
            function (reply: {
                chain: {
                    current: {
                        currentMessage: {
                            bundle: { content: { message: any } }
                        }
                    }
                }
                muid: any
            }) {
                if (
                    !reply.chain.current.currentMessage.bundle.content.message
                ) {
                    console.log(
                        '[!] [DEMOS] Received a comlink_reply without a message!'
                    )
                    return
                }
                const _muid = reply.muid
                console.log('[DEMOS] Received comlink_reply: ' + _muid)
                if (demos.replies.needReply(_muid)) {
                    console.log('[DEMOS] Received an expected reply!')
                    demos.registry[_muid] =
                        reply.chain.current.currentMessage.bundle.content.message
                    // console.log(reply.chain.current.currentMessage.bundle.content.message)
                } else {
                    console.log('[DEMOS] Received an unexpected reply!')
                }
            }
        )

        demos.socket.on('connect_error', (err: { message: any }) => {
            demos.connected = demos.socket!.connected
            demos.socket = null
            console.log(`[DEMOS] connect_error due to ${err.message}`)
        })

        demos.socket.on('connect_failed', (err: { message: any }) => {
            demos.socket!.disconnect()
            console.log(`[DEMOS] error due to ${err.message}`)
        })

        // ANCHOR Catch-all (mainly for debug purposes)
        demos.socket.onAny((event: any, data: any) => {
            console.log(event)
            console.log(data)
        })
    },

    disconnect: function () {
        demos.socket?.disconnect()
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

    // SECTION NodeCall prototype
    // INFO NodeCalls use the same structure
    nodeCall: async function (message: any, args = {}) {
        return await demos.call('nodeCall', message, args)
    },
    // TODO, FIXME & REVIEW: Replace call with validate / execute logic
    confirm: async function (transaction: Transaction) {
        return await demos.call('transaction', '', transaction, 'confirmTx')
    },
    broadcast: async function (validationData: ValidityData) {
        // FIXME Implement validationData type
        return await demos.call(
            'transaction',
            '',
            validationData,
            'broadcastTx'
        )
    },
    // INFO NodeCalls use the same structure
    call: async function (
        type: any,
        message: any,
        data: any = {},
        extra: any = '',
        sender: any = null,
        receiver: any = null
    ) {
        /* if (!demos.socket.connected) {
                console.log("[ERROR] We are disconnected")
                return
            } */
        const _muid = demos.generateMuid()

        // TODO Typize both objects below

        const transmission = {
            bundle: {
                content: {
                    type: type,
                    message: message,
                    sender: <Buffer | IBufferized | null>null,
                    receiver: null,
                    timestamp: null,
                    data: data, // REVIEW Does it works this way or should we pass it as a non-dict argument?
                    extra: extra,
                },
                hash: '',
                signature: <IBufferized | null>null,
            },
        }

        const comlink = {
            muid: _muid,
            properties: {
                connection_string: null, // NOTE We don't have a connection_string as we are clients
                require_reply: true,
                is_reply: false,
            },
            chain: {
                current: {
                    currentMessage: transmission,
                    currentMessageHash: '',
                    previousHashes: [], // Keep track of the previous hashes to have full integrity
                },
                comlinkCurrentHash: '', // is the hashed version of .current
                comlinkCurrentHashSignature: <IBufferized | null>null, // is the signature of the hashed version of.current
            },
        }

        // REVIEW Getting our shared identity
        let keys: { privateKey: any; publicKey: any }
        try {
            const id = DemosWebAuth.getInstance()
            if (id.keypair === null) {
                throw new Error('No keypair found')
            }
            keys = id.keypair
        } catch (e) {
            console.log('[ERROR LOADING IDENTITY]')
            console.log(e)
            // FIXME and // TODO Eliminate this: generating a random identity for the signature
            const seed = forge.random.getBytesSync(32)
            keys = forge.pki.ed25519.generateKeyPair({ seed })
            // megabudino was here
        }

        const privkey = keys.privateKey
        const pubKey = keys.publicKey
        console.log(keys)
        // Signaling our identity
        console.log('Parameters:')
        comlink.chain.current.currentMessage.bundle.content.sender =
            Buffer.from(pubKey)

        // NOTE Manual converting the Uint8Array to a Buffer supported by node.js and forge
        console.log('Buffered key (uint8array):')
        console.log(Buffer.from(pubKey))
        const pubKeyBuffer = bufferize(pubKey)
        console.log('Manual buffering:')
        console.log(pubKeyBuffer)
        comlink.chain.current.currentMessage.bundle.content.sender =
            pubKeyBuffer

        console.log('Actual sender:')
        console.log(comlink.chain.current.currentMessage.bundle.content.sender)
        // NOTE Doing the cryptography for the transmission object
        const stringifiedTransmissionContent = JSON.stringify(
            comlink.chain.current.currentMessage.bundle.content
        )
        console.log('Transmission Content:')
        console.log(comlink.chain.current.currentMessage.bundle.content)
        console.log('Stringified Transmission Content:')
        console.log(stringifiedTransmissionContent)
        const t_hashed = await sha256(stringifiedTransmissionContent)
        console.log(
            t_hashed +
                ' is the hashed version of comlink.chain.current.currentMessage.bundle.content'
        )
        comlink.chain.current.currentMessage.bundle.hash = t_hashed
        comlink.chain.current.currentMessageHash = t_hashed
        // And signing it
        const t_signature = forge.pki.ed25519.sign({
            message: t_hashed,
            encoding: 'utf8',
            privateKey: privkey,
        })
        console.log(
            t_signature.toString('utf8') +
                ' is the signature of the hashed version of comlink.chain.current.currentMessage.bundle.content'
        )
        comlink.chain.current.currentMessage.bundle.signature = bufferize(
            Buffer.from(t_signature)
        ) // REVIEW Changed to Buffer

        // NOTE Also hashing the comlink current property
        const stringifiedMessage = JSON.stringify(comlink.chain.current)
        const hashed = await sha256(stringifiedMessage)
        console.log(hashed + ' is the hashed version of comlink.chain.current')
        comlink.chain.comlinkCurrentHash = hashed
        // Signing the hash
        // console.log(keys.publicKey.toHex() + " is the public key of the signing key")
        // console.log(keys.privateKey.toHex() + " is the private key of the signing key")
        const signature = forge.pki.ed25519.sign({
            message: hashed,
            encoding: 'utf8',
            privateKey: privkey,
        })
        console.log(
            signature.toString('utf8') +
                ' is the signature of the hashed version of comlink.chain.current'
        )
        comlink.chain.comlinkCurrentHashSignature = bufferize(
            Buffer.from(signature)
        ) // REVIEW Changed to Buffer

        // Stringifying currentMessage
        // comlink.chain.current.currentMessage = JSON.stringify(comlink.chain.current.currentMessage)

        console.log('Sending message ')
        console.log(message)
        console.log(' to server with muid: ' + comlink.muid)
        console.log('Using the following comlink:')
        console.log(comlink)
        // Registering the reply request
        demos.replies.waitReply(_muid)
        console.log(comlink)
        demos.socket!.emit('comlink', comlink)
        // Waiting for a reply
        return await demos.replies.checkReply(_muid)
    },
    // !SECTION NodeCall prototype

    // SECTION Predefined calls
    getLastBlockNumber: async function () {
        return await demos.nodeCall('getLastBlockNumber')
    },
    getLastBlockHash: async function () {
        return await demos.nodeCall('getLastBlockHash')
    },
    getBlockByNumber: async function (blockNumber: any) {
        let block = await demos.nodeCall('getBlockByNumber', {
            blockNumber,
        })
        block = JSON.parse(block)
        console.log(typeof block)
        return block
    },
    getBlockByHash: async function (blockHash: any) {
        let block = await demos.nodeCall('getBlockByHash', {
            blockHash,
        })
        block = JSON.parse(block)
        block.content = JSON.parse(block.content)
        console.log(typeof block)
        return block
    },

    getTxByHash: async function (
        txHash = 'e25860ec6a7cccff0371091fed3a4c6839b1231ccec8cf2cb36eca3533af8f11'
    ) {
        // Defaulting to the genesis tx of course
        let tx = await demos.nodeCall('getTxByHash', {
            hash: txHash,
        })
        tx = JSON.parse(tx)
        console.log(typeof tx)
        return tx
    },

    getPeerlist: async function () {
        return await demos.nodeCall('getPeerlist')
    },
    getMempool: async function () {
        return await demos.nodeCall('getMempool')
    },
    getPeerIdentity: async function () {
        return await demos.nodeCall('getPeerIdentity')
    },

    getAddressInfo: async function (address: any) {
        const add = JSON.parse(
            await demos.nodeCall('getAddressInfo', {
                address,
            })
        )
        add.native.tx_list = JSON.parse(add.native.tx_list)
        return add
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
        createPayload: prepareWeb2Payload, // REVIEW It returns a tx that needs to be broadcasted and then confirmed due to the new method
    },
    // ANCHOR Crosschain support endpoints
    xm: {
        // INFO Working with XMTransactions
        createPayload: prepareXMPayload, // REVIEW It returns a tx that needs to be broadcasted and then confirmed due to the new method
    },

    // ANCHOR Supporting txs
    DemosTransactions,
    transactions: DemosTransactions,

    // !SECTION Operation types

    // INFO DemosWebAuthenticator
    DemosWebAuth, // NOTE Modularized to be more elegant

    // INFO Calling demos.skeletons.NAME provides an empty skeleton that can be used for reference while calling other demos functions
    skeletons,
}

async function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time))
}

// Creating a demos class
// let demos = new Demos()
// export default demos
