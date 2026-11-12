import { Transaction, TransactionContent } from "../Transaction"
import { L2PSEncryptedPayload } from "@/l2ps"

export type L2PSTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'l2psEncryptedTx'
    data: ['l2psEncryptedTx', L2PSEncryptedPayload]
}

export interface L2PSTransaction extends Omit<Transaction, 'content'> {
    content: L2PSTransactionContent
} 
/**
 * Settlement v1 fields an L2PS transfer carries in its encrypted inner
 * native send (`data[1].settlement`). Hex values are `0x` + lowercase hex.
 */
export interface L2PSTransferSettlement {
    /** Public per-transfer fee in OS, decimal string. */
    fee: string
    /** 31 random bytes as a 32-byte field element (`0x` + 64 hex). */
    salt: string
    /** Poseidon commitment (`0x` + 64 hex). */
    commitment: string
    /** ed25519 signature over the settlement message (`0x` + 128 hex). */
    signature: string
}

/** `data[1]` of the native send that an L2PS transfer encrypts. */
export interface L2PSInnerSendPayload {
    nativeOperation: "send"
    args: [string, number | string]
    l2ps_uid: string
    settlement?: L2PSTransferSettlement
}
