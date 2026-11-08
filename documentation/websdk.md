# Using the websdk

The web SDK is published as part of `@kynesyslabs/demosdk`.

```ts
import { demos } from "@kynesyslabs/demosdk/websdk"
```

### Connecting to a node

To connect to a node, use the `connect` method.

```ts
const rpc_url = "https://node2.demos.sh"

await demos.connect(rpc_url)
assert(demos.connected === true)
```

This will ping the rpc and return a `true` if the rpc is found, or throw an error. Once connected, you can now make unauthenticated requests (node calls).

```ts
const lastBlockHash = await demos.getLastBlockHash()
```

### Connecting a wallet

To create or restore a mnemonic wallet, pass the phrase string directly to
`connectWallet(mnemonic)`. This is the supported mnemonic path for new wallets.
The singleton `demos`, a `new Demos()` instance, and both forms of `Demos.start(rpc, mnemonic)`
use the same derivation. The default signing algorithm is `ed25519`.

```ts
const mnemonic = demos.newMnemonic() // Save securely; reuse the exact phrase to restore.
// To restore instead: const mnemonic = "your existing phrase"
const pubKey = await demos.connectWallet(mnemonic)
assert(demos.walletConnected === true)
assert(demos.getAddress() === pubKey)
```

Do not convert the phrase with `mnemonicToSeedSync` or `DemosWebAuth` before
connecting it. BIP39 seed bytes and the legacy helpers produce different addresses.
`isSeed` is not a supported option. For PQC signing, pass `algorithm: "falcon"`
or `algorithm: "ml-dsa"`; `getEd25519Address()` still returns the phrase's ed25519 identity.

`connectWallet(Uint8Array)` (including `Buffer`), the byte forms of `start`,
`DemosWebAuth.keyPairFromMnemonic`, `DemosWebAuth.create` (deprecated for new wallets;
only a seeded call warns), and mnemonic use
of `Cryptography.newFromSeed` are deprecated for restoration. They retain their
existing derivations. BIP39 seed bytes and the legacy helpers each emit one
console warning per loaded SDK, shared across instances and wrappers, without
logging the phrase or seed. A 64-byte ed25519 secret key also triggers the byte-input
warning; 32-byte keys passed to `connectWalletFromPrivateKey` and 128-byte prehashed
inputs do not.

**Existing wallets must keep their original derivation and input type.** This update
does not move funds, identities, or keys. Switching a legacy wallet to the phrase
path changes its address; an empty balance after a switch is not a successful
recovery. `connectWalletFromPrivateKey` also derives a master-seed identity; it does
not import a literal ed25519 keypair.

### Mnemonic compatibility vector

Public test phrase (never use for funds):

```text
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

The supported phrase path returns
`0x263af3be8487729727d99b35dcfdc61bf920a9164249ad117b292e6d3c7194f8`
from `connectWallet`, `getAddress`, and `getEd25519Address`, including the singleton
and both `start` wrappers. The regression test is
[`mnemonicDerivation.spec.ts`](../src/tests/encryption/mnemonicDerivation.spec.ts).

For compatibility, that same phrase also pins these **deprecated** results:

| Historical input / API | Preserved ed25519 address |
| --- | --- |
| `connectWallet(mnemonicToSeedSync(phrase))`, as `Uint8Array` or `Buffer` | `0xd354410dfe09779096f679ba68ecbf0e73f45af9b363192edff052667b63bcaa` |
| `DemosWebAuth.keyPairFromMnemonic(phrase)`, seeded `create(phrase)`, or `Cryptography.newFromSeed(phrase)`; also the helpers with BIP39 `Uint8Array` seed | `0x5004eb74216d55d439dda09f29c7611c59c426dad03d4b99e35a1b839cdff421` |
| Either legacy helper with a BIP39 `Buffer` seed | `0x90721022644444dd2d3b7bbc0df87fa8ef1838e2c83aa9ec40a64a41d48382d2` |
| `create(phrase)` then `connectWallet(identity.keypair.privateKey)`, as in the old example | `0x6512ecf5d8ce1b07eb6886f302c2a2d58bc09f5c5c4905b50cde6a8796ce5bae` |

The old 128-byte prehashed master-seed input is also preserved. For the UTF-8
encoding of the unprefixed SHA3-512 hex digest of this phrase, it matches the
supported phrase address. A BIP39 seed is 64 bytes and is a different input.

> [!TIP]
> You can get the address of the connected wallet using the `demos.getAddress()` method.

With the wallet connected, you can now send authenticated requests to the node.

```ts
const validityData = await demos.confirm(tx)
```

### Resetting the demos object

Once you're done, you can reset the demos object.

```ts
demos.disconnect()
```

> [!IMPORTANT]
> Calling `demos.disconnect` won't log out the deprecated `DemosWebAuth` instance. If you used it, call `DemosWebAuth.getInstance().logout()`.

<br>
<br>

# Changelog: Decoupling DemosWebAuth from the websdk

We've decoupled the `DemosWebAuth` from the helper methods and objects in the websdk. That simply means that you'll now need to pass the keypair to the methods that need it, instead of them reference the global `DemosWebAuth` instance.

Here's a list of affected methods:

### 1. DemosTransactions.sign

This method was previously using the global `DemosWebAuth` instance to sign transactions. Now you need to pass the keypair to the method.

```ts
// from:
DemosTransactions.sign(raw_tx: Transaction)

// to:
DemosTransactions.sign(raw_tx: Transaction, keypair: IKeyPair)
```

> [!TIP]
> You can use the keypair connected to the demos object with `DemosTransactions.sign` you can call `demos.tx.sign(tx)` instead.

### 2. prepareWeb2Payload

The `prepareWeb2Payload` method now requires payload parameters and a keypair for signing the `Transaction`.

```ts
// from:
prepareWeb2Payload(
    action = "GET",
    url = "https://icanhazip.com",
    ...
)

// to:
prepareWeb2Payload(
    params: IPrepareWeb2PayloadParams = {
        action: "GET",
        url: "https://icanhazip.com",
        ...
    },
    keypair: IKeyPair,
)
```

> [!TIP]
> To use the keypair connected to the demos object with `prepareWeb2Payload`, you can call `demos.web2.preparePayload(params)` instead.

### 3. prepareXMPayload

The `prepareXMPayload` method now requires a `XMScript` and a keypair for signing the `Transaction`.

```ts
// from:
prepareXMPayload(xm_payload: XMScript)

// to:
prepareXMPayload(xm_payload: XMScript, keypair: IKeyPair)
```

> [!TIP]
> To use the keypair connected to the demos object with `prepareXMPayload`, you can call `demos.xm.preparePayload(xm_payload)` instead.

### 4. Wallet.transfer

```ts
// from:
Wallet.transfer(to: Address, amount: number)

// to:
Wallet.transfer(to: Address, amount: number, keypair: IKeyPair)
```
