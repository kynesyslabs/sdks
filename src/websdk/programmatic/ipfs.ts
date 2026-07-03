import type { Transaction } from "@/types"
import { uint8ArrayToHex } from "@/encryption/unifiedCrypto"
import {
    IPFSOperations,
    type AddOptionsWithCharges,
    type IPFSPayload,
    type PinOptionsWithCharges,
} from "@/ipfs"
import { DemosTransactions } from "../DemosTransactions"
import type { ProgrammaticContext } from "./context"
import type { ProgrammaticTxOptions, ProgrammaticTxResult } from "./types"
import { resolveNonce } from "@/utils"

/**
 * IPFS operations as one-call programmatic transactions.
 *
 * Unlike `pay`/`store`/`storagePrograms`, there is no single Demos builder
 * that returns a signed `ipfs` transaction: the payloads come from
 * {@link IPFSOperations}' static creators (`createAddPayload`,
 * `createPinPayload`, `createUnpinPayload`) and the caller must assemble the
 * transaction around them. This namespace does that assembly.
 *
 * Each method builds the payload, wraps it in an UNSIGNED `ipfs` transaction
 * (nonce set exactly like `demos.storagePrograms.sign`), and hands a thunk
 * producing it to `ctx.run(...)`. The shared runner signs it and confirms it
 * against the fee ceiling before auto-broadcasting — keeping fee-cap policy,
 * confirmation strategy and result shape uniform with the rest of
 * `demos.run.*`.
 *
 * Cost control ("custom charges") is opt-in and stays simple: forward a
 * `customCharges` block through `addOptions`/`pinOptions` (obtained from
 * `IPFSOperations.quoteToCustomCharges(await demos.ipfs.quote(...))`). The
 * payload creators embed it in the payload; this namespace additionally
 * mirrors it onto `tx.content.custom_charges` so the node sees the ceiling
 * the sender signed. No quote round-trip is performed here.
 */
export function createIpfsNamespace(ctx: ProgrammaticContext) {
    /**
     * Assemble an UNSIGNED `ipfs` transaction around a ready IPFS payload.
     *
     * Replicates the nonce pattern from `demos.storagePrograms.sign`: read the
     * sender's ed25519 public key, fetch its on-chain nonce and set
     * `content.nonce = nonce + 1`. The transaction is returned unsigned; the
     * shared runner signs it.
     *
     * @param payload - An IPFS payload from an `IPFSOperations.create*` method.
     * @returns The unsigned `ipfs` transaction, ready for `ctx.run`.
     */
    const buildIpfsTx = async (
        payload: IPFSPayload,
        customNonce?: number,
    ): Promise<Transaction> => {
        const nonce = await resolveNonce(customNonce, async () => {
            const { publicKey } = await ctx.demos.crypto.getIdentity("ed25519")
            return ctx.demos.getAddressNonce(
                uint8ArrayToHex(publicKey as Uint8Array),
            )
        })

        const tx = DemosTransactions.empty()
        tx.content.type = "ipfs"
        tx.content.nonce = nonce
        tx.content.data = ["ipfs", payload]

        // Mirror the signed cost ceiling onto the transaction content when the
        // payload carries one, so the node enforces the same `max_cost_os` the
        // sender agreed to. `IPFSUnpinPayload` never has this field.
        if ("custom_charges" in payload && payload.custom_charges) {
            tx.content.custom_charges = payload.custom_charges
        }

        return tx
    }

    return {
        /**
         * Upload content to IPFS (and auto-pin it), end to end.
         *
         * @example
         * ```ts
         * // auto-broadcast within the 5 DEM fee cap:
         * await demos.run.ipfs.add("hello world", { filename: "hello.txt" })
         *
         * // with a signed cost ceiling from a quote:
         * const quote = await demos.ipfs.quote(bytes.length, "IPFS_ADD")
         * await demos.run.ipfs.add(bytes, {
         *     customCharges: IPFSOperations.quoteToCustomCharges(quote),
         * })
         * ```
         *
         * @param content - Content to upload (Buffer, Uint8Array or string).
         * @param addOptions - Filename, metadata and optional custom charges.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        add: (
            content: Buffer | Uint8Array | string,
            addOptions?: AddOptionsWithCharges,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    buildIpfsTx(
                        IPFSOperations.createAddPayload(content, addOptions),
                        opts?.nonce,
                    ),
                opts,
            ),

        /**
         * Pin an existing CID to the sender's account, end to end.
         *
         * @example
         * ```ts
         * await demos.run.ipfs.pin("QmExampleCID...")
         * ```
         *
         * @param cid - The Content Identifier to pin (CIDv0 or CIDv1).
         * @param pinOptions - Duration, metadata, `fileSize` and optional
         *                     custom charges.
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        pin: (
            cid: string,
            pinOptions?: PinOptionsWithCharges,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () =>
                    buildIpfsTx(
                        IPFSOperations.createPinPayload(cid, pinOptions),
                        opts?.nonce,
                    ),
                opts,
            ),

        /**
         * Remove a pin from the sender's account, end to end.
         *
         * @example
         * ```ts
         * await demos.run.ipfs.unpin("QmExampleCID...")
         * ```
         *
         * @param cid - The Content Identifier to unpin (CIDv0 or CIDv1).
         * @param opts - Fee ceiling / confirmation strategy / wait behaviour.
         */
        unpin: (
            cid: string,
            opts?: ProgrammaticTxOptions,
        ): Promise<ProgrammaticTxResult> =>
            ctx.run(
                () => buildIpfsTx(IPFSOperations.createUnpinPayload(cid), opts?.nonce),
                opts,
            ),
    }
}
