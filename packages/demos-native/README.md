# `@kynesyslabs/demos-native`

A dependency-minimal, Node ESM Demos client for native DEM transfers, Storage
Programs, public identity reads and DAHR requests. It exists for services that
must not install the full multichain `@kynesyslabs/demosdk` dependency graph.

```ts
import { Demos } from "@kynesyslabs/demos-native";
import { StorageProgram } from "@kynesyslabs/demos-native/storage";
import { Identities } from "@kynesyslabs/demos-native/identity-read";

const demos = new Demos();
await demos.connect(process.env.DEMOS_RPC!);
await demos.connectWallet(process.env.DEMOS_WALLET_MNEMONIC!);

const signed = await demos.transfer(recipient, 1_000_000_000n);
const validity = await demos.confirm(signed);
await demos.broadcast(validity);
```

The package intentionally supports only Demos Ed25519 authority. It does not
ship cross-chain adapters, Rubic, TLSNotary, PQC signers or the full
programmatic transaction facade. Importing a subpath requires no loader hook.

The `Demos` class preserves the DACS-used `demosdk` surface:

- RPC connection, authenticated calls and address/block/transaction reads;
- deterministic legacy wallet derivation and Ed25519 transaction signatures;
- native transfer preparation, confirmation and broadcast;
- Storage Program signing and authenticated readback;
- public and reverse identity lookups through `Identities`;
- DAHR create/start flow through `demos.web2.createDahr()`.

Amounts passed to `transfer()` are OS `bigint` values (1 DEM = 10^9 OS).
Transactions retain the current pre-/post-denomination-fork wire serializer and
property ordering. Callers remain responsible for durable nonce/effect
journaling and ambiguous-broadcast reconciliation.

## Release gates

The package is released only when a clean packed consumer passes
`npm install --engine-strict`, production audit, lock and physical CycloneDX
SBOM generation, dependency-deny inspection and native/storage/identity/DAHR
compatibility tests. The published tarball contains only `dist`, this README
and the MIT license.
