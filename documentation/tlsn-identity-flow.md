# TLSN Identity Flow

This document describes the identity flow for TLSNotary-based Web2 identity assignment and how the SDK maps payloads into GCR edits.

## Scope

This covers:

- TLSN identity assignment (`addWeb2IdentityViaTLSN`)
- GCR generation for `tlsn_identity_assign`
- Related native TLSN fees (`tlsn_request`, `tlsn_store`)

## 1. TLSN Identity Assignment Flow

The SDK method is `Identities.addWeb2IdentityViaTLSN(...)` in `src/abstraction/Identities.ts`.

### 1.1 What `addWeb2IdentityViaTLSN` sends

It builds an `InferFromTLSNPayload` with:

- `context`: `"github" | "discord" | "telegram"`
- `proof`: TLSNotary presentation
- `recvHash`: hash of receive transcript
- `proofRanges`: revealed transcript ranges (`recv`, `sent`)
- `revealedRecv`: disclosed receive bytes
- `username`, `userId`
- optional `referralCode`

Then it calls internal `inferIdentity(demos, "tlsn", payload)`.

### 1.2 Resulting identity method

Because context is `"tlsn"`, the transaction data method becomes:

- `tlsn_identity_assign`

This is generated in `Identities.inferIdentity(...)`.

### 1.3 Example usage

```ts
const res = await demos.identities.addWeb2IdentityViaTLSN(
  demos,
  "github",
  attestResult.presentation,
  recvHash,
  proofRanges,
  revealedRecv,
  githubUsername,
  githubUserId,
  referralCode,
)
```

## 2. How `tlsn_identity_assign` is persisted in GCR

In `src/websdk/GCRGeneration.ts`, `HandleIdentityOperations.handle(...)` maps `tlsn_identity_assign` into an identity edit:

- Stores `context`, `username`, `userId`
- Converts TLSN `proof` object to JSON string
- Stores `proofHash = sha256(proofString)`
- Stores transcript integrity fields:
  - `recvHash`
  - `proofRanges`
  - `revealedRecv`
- Adds `timestamp`
- Copies `referralCode`

So `tlsn_identity_assign` is represented as Web2-style identity data with TLSN-specific verification fields.

## 3. Native TLSN fee operations (related)

Also in `src/websdk/GCRGeneration.ts` under native handling:

- `tlsn_request`: burns fixed `1 DEM`
- `tlsn_store`: burns `1 + ceil(proof.length / 1024)` DEM

These are balance edits only. Node-side logic handles token/proof lifecycle.
