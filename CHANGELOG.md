# Changelog

## Unreleased

### Breaking
- Signed reference block. `sign()` reads the chain height from the connected
  node and writes it to `content.reference_block` before hashing, so it is
  covered by the transaction hash and signature. A node that enforces it
  refuses a transaction without the field, so transactions from older SDK
  versions are refused. A transaction is valid for the node's reference-block
  window counted from the height it was signed at, not from when it is
  confirmed: one that is signed and held past the window must be signed again.
  `sign()` throws when the node returns no block height. The deprecated
  `DemosTransactions.sign` cannot read the height and now requires
  `options.referenceBlock`. `L2PS.encryptTx` returns an unsigned wrapper; pass
  the transaction that carries it through `sign()`.
- TLSNotary at launch (`tlsnVerified`). `addWeb2IdentityViaTLSN` no longer
  needs `{ legacy: true }` on a network where `tlsnVerified` is active; it
  refuses the `telegram` context there (use `addTelegramIdentity`). On a
  network with only `tlsnProofEnforcement` it still throws, and
  `legacy: true` stays for networks with neither fork.
- `TLSNotary.attest` and `attestQuick` compute reveal ranges from the
  transcript instead of fixed byte prefixes: the request line, `Host` and
  the whole `X-Demos-Bind` header are revealed; `Authorization`,
  `Proxy-Authorization`, `Cookie` and other non-structural request headers
  by name only; the request body stays hidden; the response is revealed
  with `Set-Cookie` by name only (`revealResponseBody: false` hides the
  body). A caller `commit` that reveals a credential value throws.
  `attestQuick` now runs the same path as `attest`.
- `TLSNotary.verify` checks the presentation against trusted notary keys
  (`trustedNotaryKeys`, `notaryPublicKey`, or the notary's own key) and
  throws `NotaryKeyMismatchError` for any other key, or when no trusted
  key is known.
- `TLSNotaryService.requestAttestation*` waits for the `tlsn_request` to be
  included before asking for a proxy, and on `tlsnVerified` networks uses
  the request tx hash as the token id. A request included as failed, or
  not included in time, throws without asking for a proxy.
- `TLSNotaryService.storeProof*` stores on chain only and refuses a
  presentation over the network's `maxPresentationBytes` (65536 when the
  node does not report one) before signing.
- Mainnet (chain id 8587492) uses the notary URL and keys pinned in
  `tlsnotary/network.ts`. They are placeholders until the notary key
  ceremony, so attesting on mainnet throws in this build.
- TLSNotary proxies follow node#1244. `TLSNotaryService.requestAttestation*`
  and `createTLSNotary*` send `requestTLSNproxy` over the HTTP RPC signed in
  the body-bound form: the signature covers the SHA-256 of the exact body
  and names the connected node (its `/publickey`) as audience. The token id
  is always the included `tlsn_request` hash (64 lowercase hex, no `0x`),
  also on networks without `tlsnVerified`, where the returned `tokenId` for
  `storeProof` stays the node-local one. The request no longer carries
  `owner`. The returned `proxyUrl` is the session's websocket URL, ending in
  its secret session id, and is used as returned. Nodes with node#1244 refuse
  the old unsigned call (401) and `tlsn_<uuid>` token ids (400).
- `TLSNotary` no longer requests a proxy from `rpcUrl`: that call was
  unsigned, which nodes now refuse, and an instance has no key to sign it.
  `rpcUrl` is deprecated and ignored; `attest`/`getTranscript` throw unless
  `websocketProxyUrl` is set to a session URL (`createTLSNotary` sets it).
  `Demos.tlsnotary()` returns an instance without a proxy, for `verify`.
  Do not use the fixed `TLSNOTARY_PROXY_PORT` (55688) or the `proxyUrl` from
  `tlsnotary.getInfo`: nodes still report it for old clients but no longer
  listen on it.
- `L2PS.decryptTx` refuses an inner transaction that is unsigned or is not
  signed by the key in `content.from` over the transaction hash.
  `content.from_ed25519_address` and `ed25519_signature` are not checked by
  `decryptTx`. A caller that needs the account address must check that it
  matches `content.from` itself, as the node does.
  - Unsigned inner transactions are now refused: sign them before `encryptTx`.
  - On a network with the node's `signatureDomain` fork, pass
    `decryptTx(tx, { chainId })`; legacy bare-hash signatures need no option.
  - An inner transaction signed by a key other than `content.from` is
    refused. The node's L2PS instant-messaging envelopes (`from` is the
    client's key; the node signs the content with its own key) are built
    this way, so a node on this SDK version can no longer read them through
    `decryptTx`, including envelopes already stored in history. The node
    needs a matching change when it moves to this version.

### Added
- TLSNotary: the `X-Demos-Bind: demos-tlsn:v1:<context|store>:<sender>:<request tx hash>`
  header is added to every attestation made through `TLSNotaryService`;
  `computeRevealRanges`, `enforceRevealPolicy`, `buildBindValue`,
  `resolveNotary`, `checkNotaryKey`, `presentationByteLength` and the
  `TLSN_MAINNET_*` pins are exported; `NetworkInfo.forks` reports
  `tlsnProofEnforcement` and `tlsnVerified`.
- L2PS settlement v1: `buildSettledL2PSTransfer` builds the inner native
  send of an L2PS transfer with `data[1].settlement = { fee, salt,
  commitment, signature }` (Poseidon commitment, ed25519 signature over
  `l2ps-settlement:v1:<chainId>:<l2psUid>:<commitment>`), plus the pure
  encoding helpers, pinned to the node's shared vectors. `settle: false`
  keeps the pre-settlement transfer for networks without the fork.
- `Demos.bodyBoundNodeCall(message, data)`: a nodeCall signed over its exact
  body with the account's ed25519 key and naming the connected node as
  audience, as nodes require for `requestTLSNproxy`. `bodyBoundAuthHeaders`,
  `httpAuthMessage` and `audienceKey` (exported from `websdk`) build the
  same headers as the node's `peerHttpAuth.ts`.

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
- Objects that hold seeds or private keys no longer expose them through
  `JSON.stringify`, `console.log`/`util.inspect`, object spread,
  `Object.keys` or `structuredClone`: `Demos`, `UnifiedCrypto`, `Enigma`,
  `Falcon`, `DemosWebAuth`, `RSA`, `wallet.Wallet`, `L2PS`, `ZKIdentity`,
  the interactive zK `Prover` and every XM chain SDK (`DefaultChain`
  subclasses). The key fields are non-enumerable and each class has a
  redacting `toJSON()` and Node inspect hook. Reading a field by name
  (`demos.crypto.masterSeed`, `demos.keypair`, `wallet.ed25519_hex`, ...)
  and the explicit export methods (`ZKIdentity.export()`,
  `Falcon.getPrivateKey()`, ...) still return the secret. Browser devtools
  still show non-enumerable fields when an object is expanded by hand.
  `PasskeyGenerator.generate` no longer logs the private key,
  `EVM.getContractInstance` no longer logs the instance, and the Falcon
  `mnemonicToUint8Array` error names the word's position instead of the
  word.
- `Demos.connectWallet(<string>)` now throws `Invalid recovery phrase` when the
  string is not a valid BIP-39 mnemonic (a 128-character hex string still
  throws `Invalid mnemonic`). A phrase with the right word count but
  a misspelt word, a capitalised word or a bad checksum used to derive a
  different wallet silently (#175). Valid phrases derive exactly the same keys
  as before. Derivation never lowercased words, so such input is refused, not
  normalised. It also throws when the phrase contains characters that NFKD
  normalisation changes (for example full-width letters, or U+3000 between
  words): bip39 validated the normalised form, but derivation hashed the
  string as given, so such a phrase opened a different wallet. A refused call
  leaves an already-connected wallet unchanged.
  **Upgrade note:** a wallet that was only ever opened with a phrase that is
  now refused (for example a capitalised first word, or full-width letters) is
  no longer reachable through `connectWallet(<string>)`. Its keys are still
  reachable with `connectWallet(bytes)`, where `bytes` is a SHA3-512 digest as
  hex (without `0x`) encoded as UTF-8 (128 bytes). With
  `trimmed = phrase.trim()`, the digest that 4.0.21 used is:
  - `sha3_512(mnemonicToSeedSync(trimmed))` (`@scure/bip39`, no passphrase)
    when `trimmed.length` is 128 and `validateMnemonic(trimmed, english)` is
    false;
  - `sha3_512(trimmed)`, over its UTF-8 bytes, in every other case.

  These recipes reproduce the derivation used from 2.3.16 (commit `1d90dba`)
  to 4.0.21; earlier builds derived differently.
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
  `getAddressNonce` throws (see the nonce entry below), and for the 30 s
  failure TTL `getNetworkInfo` returns the node's last answer, or `null` if it never answered, in which
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
