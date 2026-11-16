# Changelog

## Unreleased

### Added
- L2PS settlement v1: `buildSettledL2PSTransfer` builds the inner native
  send of an L2PS transfer with `data[1].settlement = { fee, salt,
  commitment, signature }` (Poseidon commitment, ed25519 signature over
  `l2ps-settlement:v1:<chainId>:<l2psUid>:<commitment>`), plus the pure
  encoding helpers, pinned to the node's shared vectors. `settle: false`
  keeps the pre-settlement transfer for networks without the fork.

### Deprecated
- Mnemonic wallets have one documented path: `Demos.connectWallet(mnemonic)`.
  Restoring a mnemonic through 64-byte BIP39 seed bytes passed to
  `connectWallet` / `start`, `DemosWebAuth.create(seed)`, `keyPairFromMnemonic`
  or `Cryptography.newFromSeed` is deprecated: these derive a different address
  from the same words. They keep working, return the same addresses as before,
  and print a one-time `[demosdk] ... is deprecated` warning. 128-byte
  prehashed seeds and 32-byte private keys are unchanged and do not warn. See
  [Connecting a wallet](documentation/websdk.md#connecting-a-wallet).

### Changed
- `Hashing.sha256` hashes strings as UTF-8 unless passed `"raw"`; use it for
  forge binary strings. Identity edit `proofHash` values keep their previous
  raw encoding for node compatibility. Non-string input now throws `TypeError`
  (it previously produced an incorrect hash for binary buffers). Transaction
  hashes for non-ASCII content now match nodes using native SHA-256 (node
  commit `dcbee323`, included in `v1.0.0-rc.1` and later); nodes built from
  older code, such as the stale `testnet` branch, reject them with a hash mismatch.
- TypeScript callers that pass `Hashing.sha256` directly as a callback (for
  example, `.map(Hashing.sha256)`) no longer compile because of
  the optional `encoding` parameter; wrap it as `.map(s => Hashing.sha256(s))`.
- Web2 identity proof URLs must be ASCII; percent-encode non-ASCII path and
  query characters and use the punycode (`xn--`) form for hostnames.

### Fixed
- RPC calls no longer hang on a node that accepts a request and never
  answers. Each RPC attempt (`rpcCall`, `call`, `nodeCall` and everything
  built on them) now has a 120 s wall-clock deadline and a 512 MiB ceiling on
  reply size, in Node, Bun and browsers. The size ceiling matches V8's string
  limit (Node, Chromium) and is stricter than needed on Bun; on the browser
  XHR adapter it counts transferred, possibly compressed, bytes. The deadline
  covers the upload, the node's work and the whole reply, so some legitimate
  calls can pass it: an XM (`crosschainOperation`) broadcast runs its
  outside-chain operations inside the call, and a large upload or a large
  reply on a slow link (for example `getTxByHash` on a transaction with
  inline IPFS content) can also take longer than 120 s. Such calls fail at the
  deadline (there is no option to raise it yet); a broadcast then ends as an
  unknown outcome while the node may keep working on the request. A missed
  deadline fails like any other transport error (`call` returns the
  `{ result: 500 }` envelope holding a `TransportError` whose cause has code
  `ECONNABORTED`) and is not retried, since the node may already have the
  request. For `broadcast` that is an
  unknown outcome: `broadcastAndWait` keeps polling the transaction status.
  An oversize reply is not retried either; its cause has code
  `ERR_BAD_RESPONSE`, no `response` and a message starting
  `maxContentLength size of`. HTTP 5xx replies share that code but carry a
  `response`.
  A request that times out settles through the existing failure path, so
  callers that already turn a failed call into a fallback do the same after a
  timeout, as they already do for a refused connection or a 5xx reply:
  `getAddressNonce` returns 0, and for the 30 s failure TTL `getNetworkInfo`
  returns the node's last answer, or `null` if it never answered, in which
  case the legacy wire format is used. After a timeout the `TLSNotaryService`
  helpers that broadcast (`requestAttestation`, `storeProof` and their
  `WithConfirmation` variants) throw as if the request failed, although it
  may have landed (a TLSN request burns 1 DEM). The `WithConfirmation`
  variants pass the transaction hash to `onConfirm`, so check it before
  retrying (`getTokenByTxHash` for an attestation request, `getTxByHash` for
  a stored proof). `requestAttestation` and `storeProof` do not expose the
  hash, so check whether the account nonce moved (`getAddressNonce`) before
  retrying.
- `L2PS.encryptTx` no longer names the inner receiver in the public outer
  transaction (outer `to` is the sender) and pads the plaintext to 1024-byte
  buckets so the ciphertext length does not reveal the amount's size.
- `L2PS.encryptTx` encodes the plaintext as UTF-8, so transactions with
  non-ASCII content decrypt; ASCII plaintext bytes are unchanged.
- `getAddressNonce` and `getNextNonce` now reject failed or malformed nonce
  replies instead of using nonce 0; unexpected reply text and the looked-up
  address are bounded and sanitized in errors.
- `DemosTokens` looks up the nonce of the wallet's ed25519 account, as the
  other builders do, instead of the signing key, so falcon / ml-dsa wallets
  get the account's nonce instead of a failed lookup. `from`, and the signing
  key the token address preview derives from, are unchanged; for falcon and
  ml-dsa wallets the preview now uses the account's real next nonce.
- `getNextNonce` / `getAddressNonce` docs state the exact nonce a node
  running the `nonceEnforcement` upgrade requires (confirmed + 1 + pending)
  and no longer quote error strings; tests drive a DAHR request and cover the
  nonce lag until it is included.

## 4.0.17

### Added
- Atomic Work: `atomicWork` transaction type, Work edit types and a
  builder for all-or-nothing multi-step transactions. The node applies
  them only once its `atomicWork` fork is active.
- vLEI verifier and DACS-2 attestation module.
- L2PS: subnet history reader; committed, co-signed agreements
  (`AgreementDocument`, `commitRfq`); member-detectable delivery
  liveness.
- Dependency-minimal Demos native client with L2PS messaging.
- `resolveCciRecord` returns the full CCI record.
- `getNextNonce` helper.

### Changed
- When the connected node has forked to domain-bound signatures,
  transactions sign the domain-bound preimage.
- `signMessage` / `verifyMessage` can sign the
  `\x19Demos Signed Message:\n<len><msg>` preimage via
  `{ personal: true }`. The default is unchanged from 4.0.16 (bare bytes);
  `raw: true` still forces bare bytes.

### Fixed
- D402 client payments sign and settle through confirm + broadcast; the
  server verifies through the node's stored transaction and requires the
  recipient's actual credit, with exact recipient and memo matching.
- Web2 proof payloads are bound to the claim they are for.
- TLSNotary presentations signed by another notary are rejected.
- A failed network-info re-ask keeps the last good answer instead of
  falling back to the legacy wire format.
- The browser build no longer imports `node:url` at module load.

## 3.0.0-rc.1 (P4 — `osDenomination` migration)

Major: amount/balance/fee fields are OS bigints internally and OS
strings on the wire when the connected node has activated the
`osDenomination` fork. See `MIGRATION_v2_to_v3.md` for the full guide.

### Breaking
- `Demos.transfer` / `Demos.pay` accept `bigint` (OS, preferred) or
  `number` (DEM, deprecated, auto-converted).
- `Wallet.transfer` mirrors the dual-input rule and now delegates to
  `demos.pay` (so it picks up the sub-DEM guard and serializerGate).
- `EscrowTransaction.sendToIdentity` accepts `bigint` (OS, preferred)
  or `number` (DEM, deprecated).
- `Demos.getAddressInfo(...).balance` is `bigint` in OS. Use
  `denomination.osToDem(balance)` for display.
- `IPFSCustomCharges.max_cost_dem` → `max_cost_os`.
  `ValidityDataCustomCharges.max_cost_dem` / `actual_cost_dem` →
  `max_cost_os` / `actual_cost_os`. `IPFSOperations.{quoteToCustomCharges,
  createCustomCharges}` return the renamed fields.
- `TLSNotaryService.calculateStorageFee(KB)` returns `bigint` in OS
  instead of `number` in DEM.
- D402 `amount` carriers widened to `number | string` (preferred OS
  bigint internally).
- Wire types `TransactionContent.amount`, `TxFee.*`,
  `RawTransaction.{amount,networkFee,rpcFee,additionalFee}`,
  `StatusNative.balance`, `GCREditBalance.amount`,
  `GCREditEscrow.data.amount`, etc. widened to `number | string`.
- `STORAGE_PROGRAM_CONSTANTS.FEE_PER_CHUNK` corrected from `1n`
  (1 OS) to `OS_PER_DEM` (1 DEM = 10^9 OS). Pre-existing 10^9× bug.

### Added
- `denomination` module: `demToOs`, `osToDem`, `parseOsString`,
  `toOsString`, `formatDem`, plus constants `OS_DECIMALS`, `OS_PER_DEM`,
  `MIN_AMOUNT_OS`, `ZERO_OS`.
- `denomination.serializeTransactionContent(content, isPostFork)` —
  the SDK-side dual-format wire serializer that mirrors the node's
  `forks/serializerGate.ts`.
- `Demos.getNetworkInfo()` calling the node's `getNetworkInfo` RPC.
  Result cached per `Demos` instance for its lifetime; on RPC failure
  the SDK assumes pre-fork and emits `console.warn` exactly once.
- `SubDemPrecisionError` thrown by public-API entry points when sending
  a sub-DEM amount against a pre-fork node.

### Fixed
- `Demos.getAddressInfo` no longer trips on `null` balance fields when
  parsing into `bigint`.

## 2.x

1. `demos.pay` now requires a demos instance instead of a keypair as the second parameter. The demos instance is required to get the address nonce.

    TODO: Remove the hacking section of native transactions on the Gitbook
