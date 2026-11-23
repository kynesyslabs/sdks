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

- **Pass `bigint` (OS) to public APIs.** The published SDK v4.0.23 also
  accepts legacy `number` (DEM) inputs and converts them to OS.
- **Read `bigint` (OS) from public APIs.** `getAddressInfo(...).balance`
  is `bigint` in OS. Use `denomination.osToDem(balance)` for display.
- **Sub-DEM precision is rejected against pre-fork nodes.** If your
  amount carries `OS % OS_PER_DEM !== 0`, the SDK throws
  `SubDemPrecisionError` before signing. Either round to whole DEM or
  upgrade the target node.
- **Fork detection is automatic.** The SDK caches status per RPC URL.
  Fully activated answers remain valid; answers with pending forks are
  refreshed after 30 seconds. If a lookup fails, a prior successful answer
  for that URL is retained; only a URL with no successful answer uses the
  pre-fork fallback.
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

// Legacy DEM-number input remains supported and converts to OS.
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
await wallet.transfer(to, 100, demos)                     // legacy DEM input remains supported
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

The pre-fork wire shape carries DEM as a JavaScript `number`; it cannot
preserve arbitrary integer OS amounts and their sub-DEM remainder. The
SDK throws `SubDemPrecisionError` rather than let a pre-fork node silently
truncate that remainder:

```ts
import { denomination } from "@kynesyslabs/demosdk"

try {
    await demos.transfer(to, 1_234_567_890n) // 1.234... DEM
} catch (err) {
    if (err instanceof denomination.SubDemPrecisionError) {
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

The SDK queries the node's `getNetworkInfo` RPC and caches its answer by
RPC URL. An answer where every reported fork is already active stays valid
for that URL; an answer with a pending fork is refreshed after 30 seconds
so a long-lived instance can observe activation. Switching RPC URLs drops
the previous answer and performs a new lookup.

If `getNetworkInfo` fails or returns malformed data, the SDK uses the last
successful answer from that same RPC URL, if one exists. It returns `null`
and falls back to pre-fork wire format only when that URL has never
returned a valid answer. A failure is memoized for 30 seconds before the
SDK retries, so a temporary outage does not discard a known fork status.
The warning below is the retained cold-cache warning text; its statement
that the fallback “will be removed in v4” is historical v3 wording and is
not an accurate timeline for published v4.0.23:

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

## Version context and compatibility

The migration notes above describe the v3 transition from DEM-number
amounts to OS-bigint amounts and preserve that historical context. They
do not describe a completed v4 removal: the published `@kynesyslabs/demosdk`
v4.0.23 declarations still type `pay` and `transfer` amounts as
`number | bigint`. In that release, `number` remains the legacy DEM input
path, while `bigint` is the OS input path. The v4.0.23 implementation also
retains the pre-fork wire-format fallback when fork detection is
unavailable. This guide does not claim a removal version or schedule for
either compatibility path.
