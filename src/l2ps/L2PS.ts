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

    // Transactions that belong to the L2PS (hash -> transaction)
    encryptedTransactions: Map<string, EncryptedTransaction> = new Map()
    // TODO Add encryptedTransactions to the Block class and edit the db consequently


    constructor() {
        let rsaKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
        this.encryptionKey = rsaKeyPair.publicKey
        this.uid = rsaKeyPair.publicKey
        this.pam = forge.pki.publicKeyToRSAPublicKeyPem(this.uid)
        this.decryptionKey = rsaKeyPair.privateKey
    }

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