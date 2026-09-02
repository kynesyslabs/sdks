# `@kynesyslabs/demos-native`

A dependency-minimal, Node ESM Demos client for native DEM transfers, L2PS
messaging, Storage Programs, public identity reads and DAHR requests. It exists
for services that must not install the full multichain
`@kynesyslabs/demosdk` dependency graph.

```ts
import { Demos } from "@kynesyslabs/demos-native";
import { StorageProgram } from "@kynesyslabs/demos-native/storage";
import { Identities } from "@kynesyslabs/demos-native/identity-read";
import { L2PSMessagingPeer } from "@kynesyslabs/demos-native/messaging";

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

## DACS channel codec (provisional)

The `channel-codec` subpath implements the proposed DACS-3 v0.6 current wire
from DACS-Standard PR #367 at commit
`10e1b3d697747b82c9372693a2a6e8383e7b2c87`. It is provisional until that
Standard change is adopted; do not claim current DACS-3 conformance before
then.

```ts
import {
  createCanonicalChannelMessage,
  verifyCanonicalChannelMessage,
} from "@kynesyslabs/demos-native/channel-codec";

const message = await createCanonicalChannelMessage(unsignedMessage, {
  signer: primaryClaim,
  algorithm: "ed25519",
  sign: signExactBytes,
});

const verdict = await verifyCanonicalChannelMessage(
  receivedMessage,
  channelContext,
  resolveAuthenticatedPrimaryKey,
);
```

The verifier reconstructs the signed bytes, retains unknown signed members,
requires canonical unpadded Base64URL, dispatches from the authenticated key
algorithm, and applies channel/sequence replay policy only after signature
verification. Historical v4.0.16 messages are accepted only through the
separately named `importLegacyDemosChannelMessage()` read/import operation.
There is intentionally no legacy producer and no decoder or domain fallback.

## Encrypted transcript suite (candidate)

The `transcript-encryption` subpath supplies the executable candidate suite
`{ suiteId: "dacs-transcript-mlkem768-a256gcm", suiteVersion: 1 }`. Its exact
key binding, ML-KEM, AEAD, AAD, wrapping, hashing, rotation, revocation and
failure contracts are in
[`docs/transcript-encryption-profile.md`](docs/transcript-encryption-profile.md).

This is specification input for DACS-Standard #351, not an adopted DACS-3
format. The suite does not by itself replace the required authenticated
plaintext transcript, all-member anchor consent, signed encrypted envelope or
SR-2 receipt verification.

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
