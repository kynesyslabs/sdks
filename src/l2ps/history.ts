/**
 * Reading a subnet's transaction history back from a node.
 *
 * A subnet's transactions are encrypted, so there is no explorer to look them
 * up in: the only party that can serve them is a node in the subnet, and it
 * will only serve an account's history to whoever holds that account's key.
 * This is the signed call that asks for it.
 *
 * The node stores the payload as ciphertext and decrypts it to answer, which
 * is why the request has to prove who is asking rather than simply naming an
 * address.
 */

/** One transaction as the node's history table holds it. */
export interface L2PSHistoryEntry {
    /** Hash of the transaction as signed, before subnet encryption. */
    hash: string
    /** Hash of the encrypted envelope, as consensus refers to it. */
    encrypted_hash: string | null
    /** The L1 batch this transaction settled in, if it has settled. */
    l1_batch_hash: string | null
    /** L1 block carrying that batch. */
    l1_block_number: number | null
    type: string
    from: string
    to: string
    /** Base-unit amount, as a decimal string. */
    amount: string
    status: "pending" | "batched" | "confirmed" | "failed" | string
    /** Milliseconds since the epoch, as a decimal string. */
    timestamp: string
    /** The transaction's message, decrypted for this reader. */
    execution_message: string | null
}

export interface L2PSHistoryPage {
    l2psUid: string
    address: string
    transactions: L2PSHistoryEntry[]
    count: number
    /**
     * True when the node holds at least one more matching transaction beyond
     * this page. It looks one row past the page to answer, so a full last page
     * reports false rather than inviting a request for an empty one.
     */
    hasMore: boolean
}

export interface L2PSHistoryOptions {
    /** Whose history to read. Defaults to the connected identity. */
    address?: string
    /** Page size, capped at 1000 by the node. Defaults to 100. */
    limit?: number
    /** How many transactions to skip, for paging backwards through history. */
    offset?: number
    /**
     * Only transactions newer than this millisecond timestamp — the cheap way
     * to catch up when you already hold history.
     */
    since?: number
}

/**
 * The message a reader signs.
 *
 * It names the subnet as well as the address. Leaving the subnet out would
 * make one signature valid for a read of any subnet the node serves, so
 * anything able to relay the request could point it at a different one and
 * still present a signature that verifies.
 */
export function l2psHistoryAuthMessage(
    l2psUid: string,
    address: string,
    timestamp: number,
): string {
    return `getL2PSHistory:${l2psUid}:${address}:${timestamp}`
}

/**
 * How long the node gives a signed request to arrive. Kept here so callers
 * can see that a clock far out of step is what a 401 means.
 */
export const L2PS_HISTORY_AUTH_WINDOW_MS = 5 * 60 * 1000
