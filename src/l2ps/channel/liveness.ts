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

export interface CheckLivenessOpts {
    /** Local time the session opened. */
    openedAt: number
    /** Local time this member last sent or accepted a message. */
    lastActivityAt: number
    policy?: LivenessPolicy
    now?: number
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

    const now = opts.now ?? Date.now()
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
