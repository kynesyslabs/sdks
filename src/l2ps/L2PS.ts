// ! Fix imports and server side stuff

import * as forge from "node-forge"
import { EncryptedTransaction } from '@/types/blockchain/encryptedTransaction';
import { Block } from "@/types";
import { Transaction } from '@/types'
import { Hashing } from "@/encryption";
import { demos } from "@/websdk";

export default class L2PS {
    encryptionKey: forge.pki.rsa.PublicKey
    uid: forge.pki.rsa.PublicKey
    pam: string
    decryptionKey: forge.pki.rsa.PrivateKey

    // This will be retrieved from the db (blocks)
    partecipatingNodes: Map<string, string> = new Map() // ? Map<publicKey, connectionstring (as in Peer)>

    // Transactions that belong to the L2PS (hash -> transaction)
    encryptedTransactions: Map<string, EncryptedTransaction> = new Map()


    constructor() {
        let rsaKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
        this.encryptionKey = rsaKeyPair.publicKey
        this.uid = rsaKeyPair.publicKey
        this.pam = forge.pki.publicKeyToRSAPublicKeyPem(this.uid)
        this.decryptionKey = rsaKeyPair.privateKey
    }

    // SECTION L2PS methods
    async getPartecipatingNodes(): Promise<Map<string, string>> {
        var lastBlockResponse = await demos.nodeCall("getLastBlock", {})
        var lastBlock = lastBlockResponse.response as Block
        // REVIEW Is toString() the correct way to convert the public key to string?
        this.partecipatingNodes = lastBlock.content.l2ps_partecipating_nodes[this.uid.toString()]
        return this.partecipatingNodes
    }

    // ! TODO Add a method to set the partecipating nodes
    // The above method should be authorized through an encrypted message: if decryption succeeds, then the node is authorized to enter in the partecipating nodes
    // ? The above method does not take into account the public key of the node, it should be added (bans and so on)

    // ! TODO Add a method to create a new L2PS with a new set of partecipating nodes

    // SECTION Control methods

    // REVIEW See if it works based on the below // ?
    async getEncryptedTransactions(blockNumber: number): Promise<EncryptedTransaction[]> { // Map<string, EncryptedTransaction> {
        let encryptedTransactions: EncryptedTransaction[] = await demos.l2ps.retrieveAll(this.pam, blockNumber)
        return encryptedTransactions

    }

    async getEncryptedTransaction(eHash: string): Promise<EncryptedTransaction> {
        let encryptedTransaction: EncryptedTransaction = await demos.l2ps.retrieve(this.pam, eHash)
        return encryptedTransaction
    }

    // SECTION Encryption methods

    // Encrypt a transaction for partecipants
    private encryptTx(tx: Transaction): EncryptedTransaction {
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
    getTx(eHash: string): Transaction {
        let eTx = this.encryptedTransactions.get(eHash)
        let tx = this.decryptTx(eTx)
        return tx
    }

    // SECTION Registration methods

    // Register a transaction in the L2PS
    registerTx(tx: Transaction): void {
        let eTx = this.encryptTx(tx)
        this.encryptedTransactions.set(eTx.encryptedHash, eTx)
    }

}