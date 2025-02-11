// ! Fix imports and server side stuff

import * as forge from "node-forge"
import { EncryptedTransaction } from "@/types/blockchain/encryptedTransaction"
import { Block } from "@/types"
import { Transaction } from "@/types"
import { Hashing } from "@/encryption"
import { demos, DemosTransactions, skeletons } from "@/websdk"
import { KeyPair } from "@ton/crypto"
import { Message, MessageMap } from "./L2PSMessagingSystem"
import { ForgeToHex } from "@/utils/dataManipulation"
import { IKeyPair } from "@/websdk/types/KeyPair"

// ? Should we integrate the l2psCalls in the L2PS class?

// NOTE This replaces the register method in l2psCalls integrating it into the Transaction logic
export interface SubnetPayload {
    type: "subnet"
    uid: string
    // ? Unsure if we should use this type as it can be circular, or if we should create a data type for the subnet itself
    // NOTE ^ Anyway, this is already being checked in the L2PS class `encryptTx` method
    data: EncryptedTransaction
    // TODO Upon receiving a subnet tx at the node level, we should extract it as it is and add it to the block's proper field
}


export default class L2PS {
    encryptionKey: forge.pki.rsa.PublicKey
    uid: forge.pki.rsa.PublicKey
    pam: string
    decryptionKey: forge.pki.rsa.PrivateKey

    // This will be retrieved from the db (blocks)
    participatingNodes: Map<string, string> = new Map() // ? Map<publicKey, connectionstring (as in Peer)>

    // Transactions that belong to the L2PS (hash -> transaction)
    encryptedTransactions: Map<string, EncryptedTransaction> = new Map()

    constructor(privateKey?: forge.pki.rsa.PrivateKey) {
        let keyPair: forge.pki.rsa.KeyPair
        if (!privateKey) {
            keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
        } else {
            // Obtaining the public key from the private key
            keyPair.privateKey = privateKey
            // REVIEW Is this the correct way to set the public key?
            keyPair.publicKey = forge.pki.rsa.setPublicKey(
                privateKey.n,
                privateKey.e,
            )
        }
        this.encryptionKey = keyPair.publicKey
        this.uid = keyPair.publicKey
        this.pam = forge.pki.publicKeyToRSAPublicKeyPem(this.uid)
        this.decryptionKey = keyPair.privateKey
    }

    // SECTION L2PS methods
    async getParticipatingNodes(): Promise<Map<string, string>> {
        var lastBlockResponse = await demos.nodeCall("getLastBlock", {})
        var lastBlock = lastBlockResponse.response as Block
        // REVIEW Is toString() the correct way to convert the public key to string?
        this.participatingNodes =
            lastBlock.content.l2ps_partecipating_nodes[this.uid.toString()]
        return this.participatingNodes
    }

    // ! TODO Add a method to set the partecipating nodes
    // The above method should be authorized through an encrypted message: if decryption succeeds, then the node is authorized to enter in the partecipating nodes
    // ? The above method does not take into account the public key of the node, it should be added (bans and so on)

    // ! TODO Add a method to create a new L2PS with a new set of partecipating nodes

    // SECTION Control methods

    // REVIEW See if it works based on the below // ?
    async getEncryptedTransactions(
        blockNumber: number,
    ): Promise<EncryptedTransaction[]> {
        // Map<string, EncryptedTransaction> {
        let encryptedTransactions: EncryptedTransaction[] =
            await l2psCalls.retrieveAll(this.pam, blockNumber)
        return encryptedTransactions
    }

    async getEncryptedTransaction(
        eHash: string,
    ): Promise<EncryptedTransaction> {
        let encryptedTransaction: EncryptedTransaction =
            await l2psCalls.retrieve(this.pam, eHash)
        return encryptedTransaction
    }

    // SECTION Encryption methods

    // Encrypt a transaction for partecipants
    private encryptTx(tx: Transaction): EncryptedTransaction {
        // Safety check: we can't have another encrypted transaction within the same tx
        if (tx.content.type === "subnet") {
            throw new Error(
                "Subnet transactions cannot be encrypted (you probably have a circular reference, aka a subnet tx within a subnet tx). Please check your data structure.",
            )
        }
        let eTx = this.encryptionKey.encrypt(JSON.stringify(tx))
        let eHash = Hashing.sha256(JSON.stringify(eTx))
        let blockNumber = tx.blockNumber
        let encryptedTx: EncryptedTransaction = {
            hash: tx.hash,
            encryptedHash: eHash,
            encryptedTransaction: eTx,
            blockNumber: blockNumber,
            L2PS: this.uid,
        }
        return encryptedTx
    }

    // Decrypt a transaction from L2PS
    private decryptTx(eTx: EncryptedTransaction): Transaction {
        let tx = this.decryptionKey.decrypt(eTx.encryptedTransaction)
        let dTx: Transaction = JSON.parse(tx)
        return dTx
    }

    // SECTION Retrieval methods

    // Retrieve a transaction from the L2PS
    async getTx(eHash: string): Promise<Transaction> {
        let eTx = await this.encryptedTransactions.get(eHash)
        let tx = this.decryptTx(eTx)
        return tx
    }

    // SECTION Registration methods

    // Register a transaction in the L2PS
    async registerTx(tx: Transaction): Promise<string> {
        let eTx = this.encryptTx(tx)
        this.encryptedTransactions.set(eTx.encryptedHash, eTx)
        // TODO Add the transaction to the L2PS remotely
        return eTx.encryptedHash
    }

    // SECTION Messaging methods

    // Send a message to a specific address
    async sendMessage(address: string, message: string): Promise<string> {
        // Returns the messageId
        // TODO Implement the method
        return ""
    }

    // Retrieve all messages sent to a specific address
    async retrieveMessages(address: string): Promise<MessageMap> {
        // TODO Implement the method
        return new Map()
    }

    // Retrieve a single message from a specific address specified by its messageId
    async retrieveSingleMessage(
        address: string,
        messageId: string,
    ): Promise<Message> {
        // TODO Implement the method
        return null
    }
}



// Exporting the l2ps calls for demos.ts
// NOTE Those calls are the unencrypted ones, the encrypted ones are registered as Transactions (see SubnetPayload)
export class l2psCalls {
    // Retrieving a transaction from the L2PS
    static async retrieve(eTxHash: string,
        L2PSId: string): Promise<EncryptedTransaction> {
        let response = await demos.call(
            'l2ps',
            '',
            { eTxHash: eTxHash, L2PSId: L2PSId }, // Data
            'retrieve', // Method
        ) 
        return response as EncryptedTransaction
    }
    // Retrieving all transactions from the L2PS in a specific block
    static async retrieveAll(L2PSId: string, blockNumber: number): Promise<EncryptedTransaction[]> {
        return await demos.call(
            'l2ps',
            '',
            { L2PSId: L2PSId, blockNumber: blockNumber }, // Data
            'retrieveAll', // Method
        ) as EncryptedTransaction[]
    }

    // Takes a Transaction and give back a SubnetPayload ready to be sent in a subnet Transaction
    static async prepare(tx: Transaction, subnet: L2PS, keypair: IKeyPair): Promise<Transaction> {
        let eTxHash = await subnet.registerTx(tx)
        let eTx = await subnet.getEncryptedTransaction(eTxHash)
        // Creating the payload
        let payload: SubnetPayload = {
            type: "subnet",
            uid: ForgeToHex(subnet.uid), // REVIEW Is this the correct way to convert the public key to string?
            data: eTx,
        }
        // Creating the subnet transaction
        let subnetTx: Transaction = DemosTransactions.empty()
        // ? From and To are the same in Subnet transactions (or should we use the subnet's uid somehow?)
        subnetTx.content.from = keypair.publicKey as Uint8Array
        subnetTx.content.to = subnetTx.content.from
        subnetTx.content.type = "subnet"
        subnetTx.content.data = ["subnet", payload]

        return subnetTx
    }
}
