# `@demosnetwork/demos-native`

A dependency-minimal, Node ESM Demos client for native DEM transfers, L2PS
messaging, Storage Programs, public identity reads and DAHR requests. It exists
for services that must not install the full multichain
`@kynesyslabs/demosdk` dependency graph.

```ts
import { Demos } from "@demosnetwork/demos-native";
import { StorageProgram } from "@demosnetwork/demos-native/storage";
import { Identities } from "@demosnetwork/demos-native/identity-read";
import { L2PSMessagingPeer } from "@demosnetwork/demos-native/messaging";

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

Each RPC request of a `Demos` client (`connect()`, calls,
`storagePrograms.read()`) and of the static `StorageProgram.getByAddress()`
and `StorageProgram.searchByName()` reads must finish within 120 s, response
body included, and a response body may be at most 64 MiB. Either bound fails
the request with an error naming the URL's origin and path (not its query
string or hash). Set them for a `Demos` client with
`new Demos({ rpcTimeoutMs, rpcMaxResponseBytes })`; `rpcTimeoutMs` may be 1 to
300 000 ms, because Node's `fetch` already fails a request after 300 s without
response headers. The static `StorageProgram` reads always use the defaults.

Nodes from v1.0.0-rc.14 serve finality and storage proof reads:
`getChainIdentity()`, `getFinalizedHead()`, `getBlockSegment(from, to)`,
`getValidatorSet(blockNumber)`, `getTransactionStatus(hash)`,
`getTransactionProof(hash)`, `getStorageProof(addresses, blockNumber?)` and
`getStorageProgramLimits()`. Each returns what the connected RPC claims; this
package does not check the signatures, hashes or Merkle paths in them. When
the node refuses, they throw `NodeCallError` with the node's `result` code,
its `reason` (for example `no_result_commitment` for a transaction whose
result no block commits) and the response body. `nodeCall()` keeps returning
only the response body.

Amounts passed to `transfer()` are OS `bigint` values (1 DEM = 10^9 OS).
Transactions retain the current pre-/post-denomination-fork wire serializer and
property ordering. Callers remain responsible for durable nonce/effect
journaling and ambiguous-broadcast reconciliation.

The supported L2PS messaging entry point exposes the existing Demos messaging
server protocol without owning an agent key:

```ts
const peer = new L2PSMessagingPeer({
  serverUrl: process.env.DEMOS_L2PS_URL!,
  publicKey: demos.getAddress().slice(2),
  l2psUid: process.env.DEMOS_L2PS_UID!,
  signFn: (message) => demos.signMessage(message),
});

await peer.connect();
const history = await peer.history(remotePublicKey, { limit: 100 });
```

`signFn` is injected and receives only the exact Demos registration/history
proof string. The peer exposes send, paged history, inbound-message and
connection lifecycle operations. It transports caller-provided ciphertext as
opaque bytes and does not define a DACS channel signature or transcript
encryption format.

## Release gates

The package is released only when a clean packed consumer passes
`npm install --engine-strict`, production audit, lock and physical CycloneDX
SBOM generation, dependency-deny inspection and native/storage/identity/DAHR
compatibility tests. The published tarball contains only `dist`, this README
and the MIT license.

Maintainers publish the exact reviewed version through the manual
`Publish Demos native` GitHub workflow. The workflow re-runs the complete
release contract, requires the committed version as an explicit confirmation,
and refuses to put a prerelease on the `latest` distribution tag.
