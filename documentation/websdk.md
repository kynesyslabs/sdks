## Using the websdk

The SDK with the HTTP rewrite of the `demos` object is published at [@kynesyslabs/demosdk-http](https://www.npmjs.com/package/@kynesyslabs/demosdk-http) on NPM.

```ts
import { demos } from "@kynesyslabs/demosdk-http/websdk"
```

To connect to a node, use the `connect` method.

```ts
const rpc_url = "http://localhost:53550"

await demos.connect(rpc_url)
```

This will ping the rpc and return a `true` if the rpc is found, or throw an error. Once connected, you can now make unauthenticated requests (node calls).

```ts
const lastBlockHash = await demos.getLastBlockHash()
```

To make authenticated calls to the node (eg. confirming or broadcasting transactions), you need to connect a keypair to the demos object.

```ts
const identity = demos.DemosWebAuth.getInstance()
await identity.create()

const pubKey = await demos.connectWallet(identity.keypair.privateKey)
```

> [!TIP]
> You can get the address of the connected wallet using the `demos.getAddress()` method.


With the wallet connected, you can now send authenticated requests to the node.

```ts
const validityData = await demos.confirm(tx)
```


Once you're done, you can reset the demos object.

```ts
demos.disconnect()
```

> [!IMPORTANT]
> Calling `demos.disconnect` won't log out the `DemosWebAuth` instance. You need to call `identity.logout()` to reset that.