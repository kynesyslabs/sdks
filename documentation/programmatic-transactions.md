# Programmatic transactions (`demos.run`)

Every DEMOS transaction has historically been a three-step dance:

```ts
const tx           = await demos.pay(to, amount)   // build + sign
const validityData = await demos.confirm(tx)       // gas / validity check
const res          = await demos.broadcast(validityData)
```

The **programmatic transaction system** collapses that into a single call per
transaction type. One method fills its parameters from arguments and routes
through a single shared runner that handles `confirm → broadcast` for you,
auto-broadcasting within a configurable **fee ceiling** (default **5 DEM**).

```ts
// same payment, one call, auto-broadcast within the 5 DEM fee cap
const res = await demos.run.pay(to, amount)
```

All programmatic methods live under `demos.run.*`. The classic
`demos.pay` / `demos.confirm` / `demos.broadcast` methods are **unchanged** —
`demos.run` is an additive facade, so nothing breaks.

## Setup

```ts
import { Demos } from "@kynesyslabs/demosdk/websdk"

// one-call bootstrap (node + wallet), ready for demos.run.*
const demos = await Demos.start("https://node2.demos.sh", mnemonic)

// …equivalent to the classic two-step setup, which still works:
// const demos = Demos.instance
// await demos.connect("https://node2.demos.sh")
// await demos.connectWallet(mnemonic)
```

`Demos.start(rpc, wallet?, walletOptions?)` returns the connected instance;
omit `wallet` to connect read-only.

## The uniform result

Every `demos.run.*` method (except `attest.dahr`, see below) resolves to a
`ProgrammaticTxResult`:

```ts
interface ProgrammaticTxResult {
    broadcasted: boolean          // did it hit the network?
    skippedReason?: "manual" | "rejected"
    transaction: Transaction      // the signed, confirmed tx
    hash: string                  // tx hash
    validityData: RPCResponseWithValidityData
    broadcast?: RPCResponse       // present when broadcasted === true
    feeOs: bigint                 // total fee in OS (smallest unit)
    feeDem: string                // total fee, human-readable DEM
}
```

## The fee ceiling (`maxFee`)

In the default `"auto"` mode the runner broadcasts only if the confirmed fee is
within `maxFee` (DEM, default `5`). If it is exceeded, the tx is **signed and
confirmed but NOT broadcast**, and the runner throws `FeeCapExceededError`
carrying the fee details — a loud safety net against surprise fees.

```ts
import { FeeCapExceededError } from "@kynesyslabs/demosdk/websdk"

try {
    await demos.run.pay(to, amount)                 // cap = 5 DEM
} catch (e) {
    if (e instanceof FeeCapExceededError) {
        console.log(`fee was ${e.info.feeDem} DEM, over the cap`)
    }
}

// raise the ceiling for this call:
await demos.run.pay(to, amount, { maxFee: 25 })

// disable the ceiling entirely:
await demos.run.pay(to, amount, { maxFee: null })
```

## Confirmation strategies (`confirm`)

```ts
// 1. auto (default): broadcast within maxFee
await demos.run.pay(to, amount)

// 2. manual: build + sign + confirm only, broadcast yourself later
const r = await demos.run.pay(to, amount, { confirm: "manual" })
console.log("would cost", r.feeDem, "DEM")
await demos.broadcast(r.validityData)

// 3. callback: decide per-transaction from the fee/validity snapshot
await demos.run.pay(to, amount, {
    confirm: (info) => {
        console.log(`about to pay ${info.feeDem} DEM in fees`)
        return info.withinFeeCap            // return true to broadcast
    },
})
```

In callback mode the callback is the sole authority — `maxFee` is not
auto-enforced, but `info.withinFeeCap` tells you whether it would have passed.

## Waiting for inclusion (`wait`)

```ts
// return only once the tx lands on-chain (or fails / times out)
const r = await demos.run.pay(to, amount, {
    wait: true,
    waitOptions: { timeoutMs: 30_000, pollIntervalMs: 500 },
})
```

## Namespaces

### `demos.run.pay` / `demos.run.transfer`

Native value transfers. Amount is a DEM `number` (legacy) or OS `bigint`
(preferred).

```ts
import { denomination } from "@kynesyslabs/demosdk"
await demos.run.pay("0x...", denomination.demToOs(100))   // 100 DEM
await demos.run.transfer("0x...", 1_500_000_000n)          // 1.5 DEM in OS
```

### `demos.run.attest.*`

Identity attestations. Each returns a `ProgrammaticTxResult`.

```ts
await demos.run.attest.github(gistProofUrl)
await demos.run.attest.twitter(tweetProofUrl)
await demos.run.attest.discord(messageProofUrl)
await demos.run.attest.telegram(signedAttestation)
await demos.run.attest.domain("example.com")
await demos.run.attest.removeWeb2({ context: "github", username: "alice" })
```

#### `demos.run.attest.dahr` — the exception

DAHR (Demos Attestation Hash Response) is a **web2 proxy** attestation: the
node performs the HTTP request and its confirm/broadcast lifecycle happens
**server-side**. So `dahr` does not go through the fee-cap runner and returns
the web2 result directly (not a `ProgrammaticTxResult`); `maxFee`/`confirm`
options do not apply.

```ts
const result = await demos.run.attest.dahr({
    url: "https://api.example.com/data",
    method: "GET",
})
```

### `demos.run.tokens.*`

Token creation and execution.

```ts
await demos.run.tokens.create({ /* TokenCreationParams */ })
await demos.run.tokens.transfer(tokenAddress, to, "1000000000")
await demos.run.tokens.approve(tokenAddress, spender, "1000000000")
await demos.run.tokens.mint(tokenAddress, to, "1000000000")
await demos.run.tokens.burn(tokenAddress, from, "1000000000")
```

## Design note

Under the hood a single runner (`runProgrammaticTx`) is the only place that
calls `confirm`/`broadcast`. Each typed method just builds and signs its
transaction and hands it to the runner, which normalises the three historical
builder shapes (returns-signed-tx, returns-validityData, server-internal
lifecycle) into one confirmation policy and one result type. This is the
"common element" that makes `demos.run.pay(addr)` and
`demos.run.attest.dahr(params)` feel the same despite very different
underlying operations.
