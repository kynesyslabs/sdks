import { ISignature } from "./ISignature"
import { TransactionContent } from "./TransactionContent"
import * as forge from "node-forge"

export interface Transaction {
    content: TransactionContent
    signature: ISignature | forge.pki.ed25519.BinaryBuffer

    hash: string
    status: string
    blockNumber: number
}

