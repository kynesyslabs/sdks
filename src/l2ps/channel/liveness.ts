/**
 * CH-4 — liveness (DACS-3 §8.3.1).
 *
 * The conformance bar is "bounded delivery; members can detect failure and
 * abort". A negotiation that simply goes quiet must not leave a member waiting
 * forever: it has to be able to *notice* the stall and drive the session into a
 * terminal state (CH-5) via `abort()`.
 *
 * Two deliberate choices:
 *
 * 1. **Measured against local observation time, never the peer's `sentAt`.**
 *    `sentAt` is a field the sender fills in on its own envelope — a stalling
 *    (or hostile) counterparty could keep claiming it just spoke and look alive
 *    forever. Only what *this* member actually observed can bound delivery.
 *
 * 3. **Timestamps must come from a MONOTONIC clock.** A wall clock steps
 *    backwards (NTP, a manual correction), and a backwards step would push the
 *    deadline out until real time caught up — the stall would go unnoticed for
 *    exactly as long as the jump. `ChannelSession` defaults to a monotonic
 *    source; if you call this directly, supply one too.
 *
 * 2. **Pure, no timers.** This layer moves no bytes and owns no wall clock, the
 *    same way the session and the negotiation state machines don't. The caller
 *    asks "is it still alive?" — on a tick, before sending, or from its own
 *    watchdog — and decides whether to abort. That keeps it deterministic and
 *    testable, and leaves the abort policy where it belongs: with the member.
 */

/** Bounds for a channel's delivery. */
export interface LivenessPolicy {
    /**
     * Longest this member will tolerate seeing nothing at all on the channel
     * before calling it stalled.
     */
    turnTimeoutMs: number
    /** Optional hard cap on the whole session, measured from `open()`. */
    sessionTimeoutMs?: number
}

export const DEFAULT_LIVENESS: LivenessPolicy = { turnTimeoutMs: 60_000 }

export type LivenessState =
    | {
          status: "alive"
          /** How long since this member last observed traffic. */
          msSinceLastActivity: number
          /** When it will flip to stalled if nothing else arrives. */
          deadlineAt: number
      }
    | {
          status: "stalled"
          msSinceLastActivity: number
          reason: "turn-timeout" | "session-timeout"
          /** The deadline that was missed. */
          deadlineAt: number
      }

/**
 * A clock in milliseconds that never runs backwards and ignores wall-clock
 * corrections: `performance.now()`, or `process.hrtime` where only that
 * exists. Anything built on `Date.now()` moves when NTP or an administrator
 * moves the wall clock, in either direction, which would expire a live
 * channel early or keep a stalled one alive.
 *
 * Each call returns an independent clock; one session keeps one.
 *
 * @throws If the runtime has neither source. Pass `now` to the session then.
 */
export function monotonicClock(): () => number {
    if (typeof performance !== "undefined" && typeof performance.now === "function")
        return () => performance.now()

    const hrtime = (globalThis as { process?: { hrtime?: { bigint?: () => bigint } } }).process
        ?.hrtime
    if (typeof hrtime?.bigint === "function") {
        const read = hrtime.bigint.bind(hrtime)
        const origin = read()
        return () => Number((read() - origin) / 1_000_000n)
    }

    throw new Error(
        "monotonicClock: this runtime has no monotonic time source; pass a monotonic `now` to the session",
    )
}

export interface CheckLivenessOpts {
    /** When the session opened, on the same monotonic clock as `now`. */
    openedAt: number
    /** When this member last sent or accepted a message, on the same clock. */
    lastActivityAt: number
    policy?: LivenessPolicy
    /**
     * The current time, on the same monotonic clock as the other two. There
     * is no default: a wall-clock default would compare two different time
     * bases whenever the caller's are monotonic.
     */
    now: number
}

/**
 * Decide whether a channel is still within its delivery bounds.
 *
 * Stalls are reported, never thrown: going quiet is an expected outcome of a
 * negotiation, not a programming error — the member reacts by aborting.
 */
export function checkLiveness(opts: CheckLivenessOpts): LivenessState {
    const policy = opts.policy ?? DEFAULT_LIVENESS
    if (!Number.isFinite(policy.turnTimeoutMs) || policy.turnTimeoutMs <= 0)
        throw new Error(
            `checkLiveness: turnTimeoutMs must be a positive number, got ${policy.turnTimeoutMs}`,
        )
    if (
        policy.sessionTimeoutMs !== undefined &&
        (!Number.isFinite(policy.sessionTimeoutMs) || policy.sessionTimeoutMs <= 0)
    )
        throw new Error(
            `checkLiveness: sessionTimeoutMs must be a positive number, got ${policy.sessionTimeoutMs}`,
        )

    // A NaN anywhere makes every >= comparison below false, which would report
    // "alive" forever — a broken clock must fail loud, not silently disable the
    // only thing bounding delivery.
    for (const [name, t] of [
        ["now", opts.now],
        ["openedAt", opts.openedAt],
        ["lastActivityAt", opts.lastActivityAt],
    ] as const) {
        if (!Number.isFinite(t))
            throw new Error(
                `checkLiveness: ${name} must be a finite timestamp, got ${String(t)}`,
            )
    }

    const now = opts.now
    // Only a clock that ran backwards puts now before the last activity, and
    // with one the deadline below would move out by the size of the jump.
    // Say so rather than report "alive" on a clock that cannot bound anything.
    if (now < opts.lastActivityAt || now < opts.openedAt)
        throw new Error(
            `checkLiveness: now (${now}) is earlier than the recorded activity; the clock is not monotonic`,
        )
    const msSinceLastActivity = now - opts.lastActivityAt
    const turnDeadlineAt = opts.lastActivityAt + policy.turnTimeoutMs

    // The session cap is absolute: a channel that keeps chattering past it is
    // still over, otherwise "bounded" would mean nothing.
    if (policy.sessionTimeoutMs !== undefined) {
        const sessionDeadlineAt = opts.openedAt + policy.sessionTimeoutMs
        if (now >= sessionDeadlineAt)
            return {
                status: "stalled",
                msSinceLastActivity,
                reason: "session-timeout",
                deadlineAt: sessionDeadlineAt,
            }
        if (now >= turnDeadlineAt)
            return {
                status: "stalled",
                msSinceLastActivity,
                reason: "turn-timeout",
                deadlineAt: turnDeadlineAt,
            }
        return {
            status: "alive",
            msSinceLastActivity,
            deadlineAt: Math.min(turnDeadlineAt, sessionDeadlineAt),
        }
    }

    if (now >= turnDeadlineAt)
        return {
            status: "stalled",
            msSinceLastActivity,
            reason: "turn-timeout",
            deadlineAt: turnDeadlineAt,
        }
    return { status: "alive", msSinceLastActivity, deadlineAt: turnDeadlineAt }
}
