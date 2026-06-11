/**
 * CH-6 per-session channelId uniqueness — pluggable persistence.
 *
 * The substrate (L2PS subnet UID) already produces a unique value per
 * session in honest deployments, but the brief requires explicit rejection
 * of any session reusing a prior `channelId`. SDK ships an in-memory
 * default; production callers wire their own store (durable DB, chain
 * lookup, app-side persistence).
 */
export interface ChannelIdRegistry {
    /** Throws if `channelId` has been registered before. */
    register(channelId: string): Promise<void>
    has(channelId: string): Promise<boolean>
}

export class InMemoryChannelIdRegistry implements ChannelIdRegistry {
    private readonly seen = new Set<string>()

    async register(channelId: string): Promise<void> {
        if (!channelId) throw new Error("ChannelIdRegistry: channelId required")
        if (this.seen.has(channelId))
            throw new Error(
                `ChannelIdRegistry: channelId "${channelId}" already registered (CH-6 violation)`,
            )
        this.seen.add(channelId)
    }

    async has(channelId: string): Promise<boolean> {
        return this.seen.has(channelId)
    }
}
