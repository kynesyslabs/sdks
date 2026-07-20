# DACS-3 SR-4 — Negotiation, Agreements, and Cross-Context Identity

This guide covers the SDK surface an agent developer uses to run a DACS-3
negotiation end to end: resolve who a counterparty is, open a channel, negotiate
terms (open RFQ or sealed-envelope auction), settle on an outcome, co-sign the
resulting agreement, and monitor the channel for a stalled peer.

Everything here lives under two package subpaths. `./l2ps` re-exports the channel
and agreement surfaces as namespaces, so destructure what you need:

```ts
import { channel, agreement } from "@kynesyslabs/demosdk/l2ps"

const { ChannelSession, RfqSession, finalizeRfq, SealedEnvelopeSession, finalizeSealedEnvelope } = channel
const { buildUnsignedAgreement, coSignAgreement, verifyAgreement, commitRfq } = agreement

import { resolveCciRecord, cciSchemes, cciClaimFor } from "@kynesyslabs/demosdk/identity/cci"
```

> One rule underlies all of it (SR-4 brief §0): **the key that signs in the
> channel is the same key that controls the account's CCI primary claim** — on
> Demos, the connected Ed25519 wallet key. Never the RSA L2PS subnet key. Every
> signing helper below uses the primary-claim key; every verify helper checks
> against it.

---

## 1. Know your counterparty — `resolveCciRecord`

Before you negotiate with an agent you usually need more than its wallet: its
linked wallets on other chains, its proven Web2 handles, its PQC co-signer. All
of that is public data on the account, and `resolveCciRecord` returns it in one
call, with every linked identity expressed as a `ClaimReference`
(`<scheme>:<identifier>`) — the same currency the rest of DACS speaks.

```ts
// Read another account's record (no wallet needed — identities are public):
const them = await resolveCciRecord(demos, "demos:0x<their-address>")

them.primary          // "demos:0x…"       — who they are on Demos
them.address          // normalized Demos address
them.links            // CciLink[] — every proven identity, as claims
them.raw              // the untouched identities blob, if you need a field we dropped

// Read your own (connected wallet):
const me = await resolveCciRecord(demos)
```

Each `CciLink` carries the `claim` (`evm:0x…`, `solana:<base58>`,
`twitter:<handle>`, `github:<user>`, `mldsa:<pubkey>`, …), the `context`
(`evm`, `solana`, `twitter`, …), the `kind` (`xm` | `web2` | `pqc`), and the
original `raw` entry.

Two spelling rules matter and are handled for you:

- **Hex addresses are normalized** (lowercased, `0x`-prefixed). The node can
  hand back either checksum spelling for one EVM wallet; a raw compare would
  read them as two identities.
- **base58 (Solana) is left verbatim** — those addresses are case-sensitive, so
  "normalizing" one corrupts it.

Unknown identity kinds are skipped rather than throwing: the node grows kinds
(`ud`, `nomis`, `humanpassport`, `ethos`, `tlsn`) faster than this type does,
and "who is this agent" must not blow up because a new one showed up. TLSN-proven
identities are picked up too — the node files them under `web2.<platform>`, and
web2 parsing is generic over the platform key.

Helpers on the record:

```ts
cciSchemes(them)                 // ["evm", "solana", "twitter"]
cciClaimFor(them, "evm")         // "evm:0x…" | undefined
```

---

## 2. Open a channel — `ChannelSession`

A `ChannelSession` is the signed, sequenced envelope layer every negotiation
runs on. It stamps each message with a monotonic sequence and the `channelId`,
signs it with your primary-claim key, and rejects anything that doesn't line up.

```ts
const session = new ChannelSession({
    channelId,
    members: ["demos:0x<me>", "demos:0x<them>"],
    me: "demos:0x<me>",          // your primary claim — must be in members
    demos,                       // connected wallet — signs outgoing messages
})
await session.open()
```

The API you reach for:

- `session.sendOutgoing({ type, body, repliesTo? })` — sign and emit a message;
  returns the signed `ChannelMessage`. The negotiation sessions below wire their
  `send` to this.
- `session.receiveIncoming(msg)` — feed in a peer's message (accepts any
  sequence strictly greater than the last).
- `session.messages()` — the ordered, signed record of everything that happened.
  This is what `finalize*` and `commitRfq` verify against.
- `session.liveness(policy?)` — see §6.

---

## 3a. Negotiate in the open — `RfqSession`

An RFQ is a visible back-and-forth: someone offers terms, the other side
counters or accepts. Every step is a signed channel message, so the whole
haggle is in the transcript.

```ts
// `send` wires the negotiation to the channel — every step is a signed message:
const rfq = new RfqSession({
    me: "demos:0x<me>",
    send: (opts) => session.sendOutgoing(opts),
})

await rfq.offer({ item: "compute-hours", qty: 100, priceOs: 5_000n })  // open
await rfq.counter({ ...terms, priceOs: 4_200n })                        // reply to the standing offer
await rfq.accept()                                                      // take the standing offer
await rfq.reject("out of range")                                        // decline; session stays open
await rfq.abort("timeout")                                              // end with no deal

rfq.standingProposal   // the current live offer, or null
rfq.state              // "open" | "accepted" | "rejected" | "aborted"
rfq.outcome()          // { state, agreedTerms?, acceptedSequence? }
```

`counter()` throws if there is no standing offer; `offer()` throws if one
already stands (use `counter()`). `accept()` binds to the exact `sequence` of
the offer it accepted — that number is what the agreement later commits to.

### Finalize it

`finalizeRfq` turns an accepted negotiation into a verifiable result by checking
it against the transcript — that the accept really references a proposal that was
made in this channel, by a member, in order — and, per the disclosure `policy`,
optionally encrypts the transcript and anchors its hash on-chain.

```ts
const result = await finalizeRfq({
    rfq,
    session,
    signer: "demos:0x<me>",   // must be a member; signs the transcript
    demos,
    policy: "none",           // or "encrypted-anchored-recommended" | "…-required"
    // l2ps, consent — required only when the policy actually anchors
})
// -> { agreedTerms, acceptedSequence, transcriptHash, attestationRef? }
```

The `policy` controls disclosure: `"none"` keeps the transcript in the channel;
the `encrypted-anchored-*` policies encrypt it and anchor a re-derivable content
hash on-chain (see §5). `"…-recommended"` anchors only with `consent: true`;
`"…-required"` always anchors and needs the `l2ps` handle.

## 3b. Negotiate blind — `SealedEnvelopeSession`

When bids must not influence each other (a procurement auction, a price
discovery round), use a sealed envelope: everyone **commits** to a hash of their
bid first, then everyone **reveals**. A reveal is only accepted if it opens the
commitment — `sha256("dacs-sealed-envelope:v1:" || JCS({bid, salt}))` — so no one
can see a bid before committing and no one can change a bid after.

```ts
const auction = new SealedEnvelopeSession({
    me: "demos:0x<me>",
    participants: members,       // everyone bidding; `me` must be in it
    send: (opts) => session.sendOutgoing(opts),
})

// Phase 1 — commit (bid stays secret; a random salt is generated for you):
await auction.commit({ priceOs: 4_200n, terms: "net-30" })

// Phase 2 — once commits are in, close the commit phase and reveal:
auction.closeCommitPhase()
await auction.reveal()

const outcome = auction.close()
// -> { state: "closed", reveals: RevealedBid[], winner?, winningBid? }
```

Behavior worth knowing:

- **A reveal that doesn't open its commit disqualifies that sender** — it does
  not throw and does not stop the auction. Same for a malformed reveal.
- A participant that committed but never revealed is disqualified from the
  outcome but remains recorded in the transcript.
- Duplicate participants are rejected at construction; a disqualified sender
  cannot re-reveal.
- Bids are checked to be injectively serializable — a non-finite number
  (`NaN`, `Infinity`) is refused, because JCS renders it as `null` and
  `{price: NaN}` would collide with `{price: null}`.

### Finalize it

`finalizeSealedEnvelope` re-derives the winner from the transcript and refuses
anything inconsistent: the auction must be `closed`, the signer must be a member,
every reveal must cryptographically open its commit, every disqualified party
must have a commit on record, and a closed auction with no valid reveals **and**
no disqualified participants is rejected (nothing happened — there is nothing to
finalize).

```ts
const result = await finalizeSealedEnvelope({
    sealed: auction,
    session,
    signer: "demos:0x<me>",   // must be a member; signs the transcript
    demos,
    policy: "none",           // same disclosure options as finalizeRfq
})
```

---

## 4. Commit the deal — `AgreementDocument`

The outcome of a negotiation is not yet an agreement. The `AgreementDocument` is
what the parties actually agreed, **co-signed by every one of them** with the key
controlling their CCI primary claim. Only its hash is anchored on-chain; the
document itself stays in the channel.

```ts
interface AgreementDocument {
    channelId: string
    parties: ClaimReference[]     // every member, as demos: claims
    body: unknown                 // the agreed terms — opaque to the SDK
    agreedAt: number              // unix ms
    refs?: { transcriptHash?: string; /* … */ }
    signatures: AgreementSignature[]   // exactly one per party
}
```

### The easy path from an RFQ — `commitRfq`

If the agreement is just "we commit to the RFQ we accepted," `commitRfq` does the
whole thing: it verifies the accepted proposal is really in this session's
transcript, builds the document, and co-signs it with every member.

```ts
const doc = await commitRfq({
    rfq,
    session,
    signers: [
        { claim: "demos:0x<me>",   demos: myDemos },
        { claim: "demos:0x<them>", demos: theirDemos },
    ],
    // agreedAt?: defaults to now
    // transcriptHash?: bind the document to a specific transcript
})
```

It throws if the negotiation isn't `accepted`, if the accepted proposal isn't in
the transcript, or if the signer set isn't **exactly** the channel membership.

### The manual path

When the body isn't a straight copy of the RFQ terms, build and co-sign directly:

```ts
const unsigned = buildUnsignedAgreement({
    channelId,
    parties: members,
    body: negotiatedTerms,
    agreedAt,
})

const doc = await coSignAgreement({
    document: unsigned,
    signers: [
        { claim: "demos:0x<me>",   demos: myDemos },
        { claim: "demos:0x<them>", demos: theirDemos },
    ],
})
```

`coSignAgreement` requires **exactly one signer per party** — no missing party,
no extra signer, no party signing twice.

### Verify it

```ts
const check = verifyAgreement(doc, { members })
// -> { ok: boolean, errors: string[] }
```

`members` is **required**: verifying signatures alone tells you the signatures
are valid, not that the right people signed. `verifyAgreement` additionally
enforces that the signatures are exactly the membership — that is the §0
invariant. (`verifyAgreementSignatures` is the weaker check, when you only have
the signatures and not the membership.)

---

## 5. Timestamps and hashing

All hashing is `sha256` over a canonical (JCS-style) serialization, with a
per-purpose domain prefix so a signature for one context can never be replayed in
another:

| Purpose             | Domain prefix                  |
| ------------------- | ------------------------------ |
| Channel message     | see `CHANNEL_MESSAGE_DOMAIN_PREFIX` |
| Transcript          | see `TRANSCRIPT_DOMAIN_PREFIX` |
| Sealed-envelope bid | `dacs-sealed-envelope:v1:`     |
| Agreement           | `dacs-agreement:v1:`           |

Canonical serialization refuses non-finite numbers everywhere, for the
injectivity reason in §3b.

---

## 6. Don't wait forever — liveness

A negotiation stalls when a peer goes quiet. `checkLiveness` (and the
`session.liveness()` convenience) tells you whether the current turn or the whole
session has timed out — measured on **your local observation clock**, never a
peer's self-reported `sentAt` (a peer could otherwise claim it just spoke).

```ts
const state = session.liveness({ turnTimeoutMs: 60_000, sessionTimeoutMs: 600_000 })

if (state.status === "stalled") {
    state.reason              // "turn-timeout" | "session-timeout"
    state.msSinceLastActivity // how long the peer has been quiet
    // → escalate: re-send, switch counterparty, abort
} else {
    state.deadlineAt          // when it flips to stalled if nothing arrives
}
```

The default clock is monotonic (`performance.now`), not wall-clock, so a system
clock that jumps backward can't silently extend a deadline. Timestamps that
aren't finite numbers throw rather than being treated as `0`.

---

## End-to-end shape

```ts
// 1. who am I dealing with
const them = await resolveCciRecord(demos, counterpartyClaim)

// 2. open the channel
const session = new ChannelSession({ channelId, members, me, demos })
await session.open()

// 3. negotiate (open RFQ shown; sealed-envelope is the §3b swap)
const rfq = new RfqSession({ me, send: (o) => session.sendOutgoing(o) })
await rfq.offer(terms)
// … counter() / accept() …

// 4. finalize + co-sign the agreement, bound to the transcript
const doc = await commitRfq({ rfq, session, signers })

// 5. verify before you rely on it
const { ok } = verifyAgreement(doc, { members })

// 6. while waiting on a peer, watch for a stall
if (session.liveness({ turnTimeoutMs: 60_000 }).status === "stalled") { /* escalate */ }
```

---

## Status

This surface ships across SR-4 work items WI-A…WI-D and the CCI record work.
Wire schemas for the `AgreementDocument` (DACS-3 §8.5.1) and channel envelopes
(§8.3.3) are fixed by the DACS-3 spec, which is not in this repo; the invariants
here are implemented per the SR-4 implementation brief
(`docs/l2ps-sr4-implementation-brief.md` in the node repo). Reconcile field names
against the spec before treating them as final.
