# Using the websdk

The SDK with the HTTP rewrite of the `demos` object is published at [@kynesyslabs/demosdk-http](https://www.npmjs.com/package/@kynesyslabs/demosdk-http) on NPM.

```ts
import { demos } from "@kynesyslabs/demosdk-http/websdk"
```

### Connecting to a node

To connect to a node, use the `connect` method.

```ts
const rpc_url = "http://localhost:53550"

await demos.connect(rpc_url)
assert(demos.connected === true)
```

This will ping the rpc and return a `true` if the rpc is found, or throw an error. Once connected, you can now make unauthenticated requests (node calls).

```ts
const lastBlockHash = await demos.getLastBlockHash()
```

### Connecting a wallet

To make authenticated calls to the node (eg. confirming or broadcasting transactions), you need to connect a keypair to the demos object.

```ts
const identity = demos.DemosWebAuth.getInstance()
await identity.create()

const pubKey = await demos.connectWallet(identity.keypair.privateKey)
assert(demos.walletConnected === true)
```

You can also connect a wallet using a mnemonic.

```ts
const mnemonic = "property gym walk decorate laundry grab cabin outer artist nest castle vote"

const pubKey = await demos.connectWallet(mnemonic, {
    isSeed: true,
})
```

Or if you have a bip39 seed.

```ts
const mnemonic = "property gym walk decorate laundry grab cabin outer artist nest castle vote"
const seed = bip39.mnemonicToSeedSync(mnemonic)

const pubKey = await demos.connectWallet(seed, {
    isSeed: true,
})
```

> [!TIP]
> The process of converting a mnemonic to a keypair is defined at `Cryptography.newFromSeed` (in `@/encryption/Cryptography.ts`).

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
> Calling `demos.disconnect` won't log out the `DemosWebAuth` instance. You need to call `identity.logout()` to reset that.

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
