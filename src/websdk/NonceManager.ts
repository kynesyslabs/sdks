import { assertValidNonce } from "@/utils"

/**
 * Per-address nonce sequencer for a single Demos client.
 *
 * The node reports an address's nonce lagging inclusion: `getAddressNonce()`
 * returns the last confirmed nonce, not counting transactions already
 * broadcast but not yet included. So two sends fired back-to-back both read
 * the same on-chain value, compute the same nonce, and collide — the node
 * rejects the second one. That is the batch-failure mode apps hit when
 * sending several transactions from the same address at once.
 *
 * NonceManager fixes this on the client: it keeps a local "next nonce" per
 * address, seeded once from the node, then hands out strictly increasing
 * nonces without re-reading the lagging chain value between sends.
 * Reservations are serialized per address so concurrent callers never share
 * a nonce.
 *
 * Boundary: this only sequences sends from THIS client. If the same key
 * signs from another client/device concurrently, the local counter drifts
 * from the chain — call {@link reset} to reseed from the node. Likewise, a
 * reserved nonce is consumed at build time; if that transaction never lands
 * the counter runs ahead of the chain, so callers should {@link reset} the
 * address after a nonce-rejection so the next reservation reseeds.
 */
export class NonceManager {
    /** Next nonce to hand out per address (absent = not yet seeded). */
    private readonly next = new Map<string, number>()
    /** Per-address serialization tail so concurrent reservations don't race. */
    private readonly tail = new Map<string, Promise<unknown>>()

    /**
     * Reserve the next nonce for `address`, serialized against other
     * reservations for the same address. Seeds from `fetchNext` on first use
     * (or after {@link reset}); `fetchNext` must resolve the next usable nonce
     * for the address — i.e. one accounting for txs already pending, not just
     * the confirmed count (see `Demos.getAddressPendingNonce`).
     */
    async reserve(
        address: string,
        fetchNext: () => Promise<number>,
    ): Promise<number> {
        const prior = this.tail.get(address) ?? Promise.resolve()
        const run = prior.then(async () => {
            let n = this.next.get(address)
            if (n === undefined) {
                // Seed once. `fetchNext` already returns the next nonce to
                // use; subsequent reservations increment locally so rapid
                // sends don't re-read the lagging confirmed nonce.
                n = await fetchNext()
            }
            this.next.set(address, n + 1)
            return n
        })
        // Swallow the tail's outcome so one rejected reservation (e.g. a
        // transient getAddressNonce failure during seeding) does not poison
        // every later reservation for this address. The real error still
        // surfaces to this caller via `run`.
        this.tail.set(
            address,
            run.then(
                () => undefined,
                () => undefined,
            ),
        )
        return run
    }

    /**
     * Drop local state for `address` so the next {@link reserve} reseeds from
     * the node. Call after a broadcast fails with a nonce error, or when
     * another client may have sent from the same address.
     */
    reset(address: string): void {
        this.next.delete(address)
    }

    /** Drop local state for every address. */
    resetAll(): void {
        this.next.clear()
    }

    /**
     * Force the next nonce for `address` (advanced use / recovery). The next
     * {@link reserve} returns exactly `nextNonce`.
     */
    seed(address: string, nextNonce: number): void {
        this.next.set(address, assertValidNonce(nextNonce))
    }

    /**
     * The nonce the next {@link reserve} would hand out for `address`, or
     * `undefined` if the address has not been seeded yet.
     */
    peek(address: string): number | undefined {
        return this.next.get(address)
    }
}
