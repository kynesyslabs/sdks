# Migrating from `@kynesyslabs/demosdk` v2 to v3

The `osDenomination` fork moves Demos's on-chain accounting unit from
human-readable DEM (`number`) to indivisible OS (`bigint`/decimal
string) — `1 DEM = 10^9 OS`. The SDK follows: every amount, balance, and
fee field that touches the wire or carries a token quantity is now
expressed in OS, internally as `bigint` and on-the-wire as a canonical
decimal string when the connected node is post-fork.

This guide walks the breaking changes and the code-level patterns that
replace them. The companion spec is in
`decimal_planning/SPEC_P4.md`.

## TL;DR

- **Pass `bigint` (OS) to public APIs.** `number` (DEM) is still
  accepted as a deprecated convenience; it auto-converts to OS via
  `OS_PER_DEM`.
- **Read `bigint` (OS) from public APIs.** `getAddressInfo(...).balance`
  is `bigint` in OS. Use `denomination.osToDem(balance)` for display.
- **Sub-DEM precision is rejected against pre-fork nodes.** If your
  amount carries `OS % OS_PER_DEM !== 0`, the SDK throws
  `SubDemPrecisionError` before signing. Either round to whole DEM or
  upgrade the target node.
- **No code change is needed for fork detection.** The SDK auto-detects
  fork status via `getNetworkInfo` and caches the result for the
  instance's lifetime. The first failed detection emits one
  `console.warn`; the SDK then assumes pre-fork.
- **Multi-chain (XM) amounts are unchanged.** Lamports (Solana), drops
  (XRP), octas (Aptos), wei (EVM) etc. stay in their chain-native
  units.

## The denomination

| Unit | Type             | When                                  |
|------|------------------|---------------------------------------|
| DEM  | `number`         | Human-readable display only           |
| OS   | `bigint`         | SDK-internal arithmetic               |
| OS   | `string`         | Wire format (post-fork)               |
| DEM  | `number`         | Wire format (pre-fork legacy)         |

`1 DEM = 1_000_000_000 OS`. Conversion helpers:

```ts
import { denomination } from "@kynesyslabs/demosdk"

denomination.demToOs(100)              // 100_000_000_000n
denomination.demToOs("1.5")            // 1_500_000_000n
denomination.demToOs("0.000000001")    // 1n  (one OS, the smallest unit)

denomination.osToDem(100_000_000_000n) // "100.0"
denomination.osToDem(1n)               // "0.000000001"

denomination.toOsString(1_500_000_000n)  // "1500000000"  (canonical wire)
denomination.parseOsString("1500000000") // 1_500_000_000n

denomination.formatDem(1_500_000_000n) // "1.5 DEM"
```

## Breaking changes

### `Demos.transfer` / `Demos.pay`

```ts
// v2
await demos.transfer("0x...", 100)            // 100 DEM
await demos.pay("0x...", 100)

// v3 (preferred)
import { denomination } from "@kynesyslabs/demosdk"
await demos.transfer("0x...", denomination.demToOs(100))  // 100 DEM
await demos.transfer("0x...", denomination.demToOs("1.5")) // 1.5 DEM
await demos.transfer("0x...", 1_500_000_000n)              // raw OS

// v3 (still works, deprecated — auto-converts to OS)
await demos.transfer("0x...", 100)            // 100 DEM (treated as DEM)
```

### `Demos.getAddressInfo(addr).balance`

```ts
// v2
const info = await demos.getAddressInfo(addr)
const balanceDem: number = Number(info.balance) // DEM, but typed bigint :/

// v3
const info = await demos.getAddressInfo(addr)
const balanceOs: bigint = info.balance              // OS bigint
const display: string = denomination.osToDem(balanceOs) // "1.5"
```

### `Wallet.transfer`

Identical bigint-OS rules; delegates to `Demos.pay` so it gets the
sub-DEM guard, the serializerGate, and the canonical native-send tx
shape for free.

```ts
// v2
await wallet.transfer(to, 100, demos)

// v3
import { denomination } from "@kynesyslabs/demosdk"
await wallet.transfer(to, denomination.demToOs(100), demos)
await wallet.transfer(to, 1_500_000_000n, demos)         // raw OS
await wallet.transfer(to, 100, demos)                     // legacy DEM (deprecated)
```

### `EscrowTransaction.sendToIdentity`

```ts
// v2
const tx = await EscrowTransaction.sendToIdentity(
    demos, "twitter", "@bob", 100,
    { expiryDays: 30 },
)

// v3
import { denomination } from "@kynesyslabs/demosdk"
const tx = await EscrowTransaction.sendToIdentity(
    demos, "twitter", "@bob", denomination.demToOs(100),
    { expiryDays: 30 },
)
// Or: pass `1_500_000_000n` directly for raw OS.
```

### `IPFSCustomCharges` / `ValidityDataCustomCharges`

The DEM-suffixed field names are renamed to OS:

| v2                | v3                |
|-------------------|-------------------|
| `max_cost_dem`    | `max_cost_os`     |
| `actual_cost_dem` | `actual_cost_os`  |

Values stay as `string` (decimal OS). `IPFSOperations.quoteToCustomCharges`
auto-converts pre-fork DEM-string responses, so existing pre-P3 nodes
continue to work without consumer changes. Update field reads:

```ts
// v2
const charges = await demos.ipfs.createCustomCharges({...})
console.log(charges.max_cost_dem)

// v3
const charges = await demos.ipfs.createCustomCharges({...})
console.log(charges.max_cost_os)
```

### `TLSNotaryService.calculateStorageFee`

Returns a `bigint` in OS instead of a `number` in DEM.

```ts
// v2
const feeDem: number = tlsn.calculateStorageFee(proofSizeKB)

// v3
const feeOs: bigint = tlsn.calculateStorageFee(proofSizeKB)
const feeDemDisplay: string = denomination.osToDem(feeOs)
```

### D402 client/server `amount`

`number | string` accepted; `bigint` is the preferred internal carrier.
The wire on a post-fork node carries an OS decimal string; pre-fork
remains a JS number in DEM.

## Sub-DEM precision against pre-fork nodes

The pre-fork wire shape is a JS `number` in DEM. JavaScript `number`
cannot represent values smaller than 1 DEM, so the SDK throws
`SubDemPrecisionError` when a caller sends an amount with sub-DEM
precision against a pre-fork node:

```ts
import { SubDemPrecisionError } from "@kynesyslabs/demosdk"

try {
    await demos.transfer(to, 1_234_567_890n) // 1.234... DEM
} catch (err) {
    if (err instanceof SubDemPrecisionError) {
        // Either round to whole DEM, or upgrade the target node.
        // err.amountOs = 1_234_567_890n
        // err.subDemRemainderOs = 234_567_890n
    }
}
```

The error fires before any tx construction; nothing reaches the wire.

## Multi-chain (XM) amounts — unchanged

These remain in their chain-native smallest unit:

| Chain  | Field carrier            | Unit            |
|--------|--------------------------|-----------------|
| EVM    | `args[1]` / `value`      | wei (uint256)   |
| Solana | `SolNativeTransfer.amount` | lamports      |
| XRPL   | `preparePay(amount)`     | drops           |
| Aptos  | `fundFromFaucet(amount)` | octas           |
| TON    | chain-native             | nanotons        |
| Bridge | `BridgeOperation.amount` | stablecoin units|

Do **not** call `denomination.demToOs` on these. They are not DEM.

## Fork detection — automatic

The SDK calls the node's `getNetworkInfo` RPC on the first `sign()`
after `connect()`, then caches the result on the `Demos` instance for
the instance's lifetime. To re-fetch (e.g. after the connected node
upgraded), construct a fresh `Demos`.

If the node is too old to expose `getNetworkInfo` (or the RPC returns
malformed data, or the network call fails), the SDK assumes pre-fork
wire format and emits one `console.warn` per `Demos` instance:

> getNetworkInfo unavailable on target node — assuming pre-fork wire
> format. Upgrade the node to a post-fork-aware version (>= the version
> that ships with forkHandlers). This fallback path is deprecated and
> will be removed in v4.

## Internal carriers — what changed

If you have code that reaches into `tx.content.amount` / `transaction_fee.*`
/ `gcr_edits[]` directly (not via the public methods), note:

- `tx.content.amount`: now `number | string` statically; runtime
  carrier is bigint OS in the v3 SDK paths. The serializerGate
  normalises whichever shape it sees to the right wire format at hash
  time.
- `tx.content.transaction_fee.*`: same widening, same normalisation.
- `gcr_edits[].amount` (Balance + nested escrow): same.
- `tx.content.data` for native send: `args[1]` is the wire shape
  directly — number for pre-fork, OS string for post-fork. The SDK
  resolves this at construction time using the cached fork status.

## Storage program fee constant

`STORAGE_PROGRAM_CONSTANTS.FEE_PER_CHUNK` has been corrected from `1n`
(1 OS) to `OS_PER_DEM` (1 DEM = 1_000_000_000 OS). This was a
pre-existing 10^9× under-charging bug; the post-fork node will charge
the corrected fee.

## Removal timeline

- **v3.0.0-rc.1** (this release): both shapes accepted. `bigint` is
  preferred; `number` paths warn in JSDoc.
- **v3.0.0** (stable): unchanged surface from rc.1.
- **v4.0.0**: `number` overloads removed. The "pre-fork node — assuming
  legacy wire" fallback path is removed; SDK requires a post-fork node.
