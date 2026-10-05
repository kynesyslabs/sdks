# Changelog

## Unreleased

### Fixed
- `getNextNonce` / `getAddressNonce` docs state the exact nonce the node
  requires (confirmed + 1 + pending) and quote the node's real error
  strings; a test covers the lag of a DAHR send that is not yet included.

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
