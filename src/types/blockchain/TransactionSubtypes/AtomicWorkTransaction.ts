import { Transaction, TransactionContent } from "../Transaction"
import {
    GCREditResourceSlot,
    GCREditStoragePut,
    GCREditWorkAttempt,
    GCREditWorkReceipt,
} from "../GCREdit"

type Unsigned<T> = Omit<T, "isRollback" | "txhash">

/** A Work edit as the sender signs it; the node fills rollback and tx hash. */
export type AtomicWorkEdit =
    | Unsigned<GCREditWorkAttempt>
    | Unsigned<GCREditWorkReceipt>
    | Unsigned<GCREditResourceSlot>
    | Unsigned<GCREditStoragePut>

/** A payment from the sender that commits with the Work, or not at all. */
export interface AtomicWorkTransfer {
    to: string
    /** Positive integer amount, as a decimal string. */
    amount: string
}

/**
 * Payload for an `atomicWork` tx: one Work, applied all-or-nothing.
 *
 * `edits` starts with the Work's attempt. Transfers are debited from the
 * sender only, so the payload cannot move anyone else's funds.
 */
export interface AtomicWorkPayload {
    edits: AtomicWorkEdit[]
    transfers?: AtomicWorkTransfer[]
}

export type AtomicWorkTransactionContent = Omit<TransactionContent, "type" | "data"> & {
    type: "atomicWork"
    data: ["atomicWork", AtomicWorkPayload]
}

export interface AtomicWorkTransaction extends Omit<Transaction, "content"> {
    content: AtomicWorkTransactionContent
}
