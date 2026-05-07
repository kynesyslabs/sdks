# Changelog

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
