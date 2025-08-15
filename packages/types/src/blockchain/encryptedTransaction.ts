import * as forge from "node-forge"

export interface EncryptedTransaction { // NOTE Ideally this structure should be used for the database as well
    hash: string
    encryptedHash: string // ? is it right ?
    encryptedTransaction: string // ? is it right ?
    blockNumber: number
    L2PS: forge.pki.rsa.PublicKey // id of the L2PS that encrypted the transaction
}