import { Transaction, TransactionContent } from "../Transaction"
import {
    GCREditResourceSlot,
    GCREditStoragePut,
    GCREditWorkAttempt,
} from "../GCREdit"

type Unsigned<T> = Omit<T, "isRollback" | "txhash">

/** A Work edit as the sender signs it; the node fills rollback and tx hash. */
export type AtomicWorkEdit =
    | Unsigned<GCREditWorkAttempt>
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
 * sender only, so the payload cannot move anyone else's funds. There is no
 * receipt here: it commits to the block the Work lands in, so the node
 * builds it and commits to it in the same transition as the effects.
 */
export interface AtomicWorkPayload {
    /**
     * The unsigned intent the Work was agreed as. The node recomputes the
     * attempt's workId and canonicalBytesHash from it and checks its profile.
     */
    intent: Record<string, unknown>
    /** Per-operation role authorizations, as the intent's profile defines them. */
    authorizations?: Record<string, unknown>[]
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
