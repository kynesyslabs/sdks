# Experimental basic sealed-bid helper (non-complete)

`createExperimentalSealedBid` and `verifyExperimentalSealedBidOpening` are low-level SDK helpers for one publisher–bidder channel pair. They are **experimental and not a DACS v0.6 conformant sealed-auction profile**. They do not start an auction, select a winner, issue a SAC receipt, or establish that every valid bid was considered. They do not implement the Standard's SAC-11 commitment wire/domain, CandidateSetBindingRef, or SAC-3 completeness proof. The [current complete-auction requirements](https://github.com/DACS-Agent-commerce/DACS-Standard/blob/9d928ff7ed76dc90eac2eb025e8363a310bbe659/spec/DACS-3-NEGOTIATE.md#L613-L626) remain separate; [Standard issue #407](https://github.com/DACS-Agent-commerce/DACS-Standard/issues/407) is tracking whether a distinct non-complete basic profile should exist.

## What the helper proves

It creates a salted commitment to a JSON bid, bound to the exact auction ID, job or listing ID, channel ID, and bidder primary claim. The opening verifier checks two signed channel messages from that bidder, their message types and order, the context, and the commitment hash. Use a fresh helper result for each bid; keep the opening (including its 256-bit salt) private and durable until a separately established reveal phase. Both channel messages must still be processed by the normal `ChannelSession`/transport for membership and replay checks. The application must independently establish that this channel's member set is exactly `{publisher, bidder}` and that its channel ID is not reused for another session; this pair verifier checks neither fact and is not a replacement for that layer.

```ts
import { channel } from "@kynesyslabs/demosdk/l2ps"

const context = {
    auctionId: "auction-123",
    subjectKind: "job" as const,
    subjectId: "job-456",
    channelId: bidderChannel.channelId,
    bidder: bidderClaim,
}
const { commit, opening } = channel.createExperimentalSealedBid(context, { price: 100 })
const committed = await bidderTransport.send({ type: "sealed-envelope-commit", body: commit })
// Persist the opening securely. Stop here until your application has verified
// a shared reveal authorization; this SDK does not supply that authority.
```

Here `bidderTransport` is an already configured `L2PSChannelTransport`; unlike `ChannelSession.sendOutgoing`, its `send` method delivers the signed envelope. After the application independently verifies shared reveal authorization, it may send `opening` with `bidderTransport.send({ type: "sealed-envelope-reveal", body: opening })`. The receiver can then call `verifyExperimentalSealedBidOpening(context, committed, revealed)` on the two channel-verified envelopes. This is **not** a complete workflow. An application must define and verify a shared commit close and reveal close before treating messages as timely. `sentAt`, a local clock, all *observed* bidders having committed, or one peer's `close()` call are not shared deadline authority. The helper intentionally never auto-advances a phase, never closes a phase, and never declares a missing reveal forfeited. In particular, a delayed valid reveal must not be discarded merely because one peer locally entered another phase. If the application lacks objective deadline evidence, the auction result is indeterminate; do not announce a winner.

## What it cannot prove

Each bidder can have a separate publisher–bidder channel. The publisher or selector may leave a channel's bid out of the candidate list, deliberately or accidentally. A signed commitment and valid opening from the *included* channels cannot detect an omitted better bid. The SDK has no complete cross-channel candidate enumeration or proof. A result computed over observed bids means only “highest of the bids presented,” never “highest of all anchored valid bids.” Do not describe this helper or its output as a fair, complete, or DACS-conformant sealed auction.
