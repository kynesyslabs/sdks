## General layout of the multichain SDKs

SDKs should be imported from `@demos/xm-websdk` or `@demos/xm-localsdk`.

```ts
import { EVM, XRPL, MULTIVERSX, IBC } from '@demos/xm-websdk'

// or

import { EVM, XRPL, MULTIVERSX, IBC } from '@demos/xm-localsdk'
```

### Creating an instance

```ts
const instance = EVM.create(rpc_url)

// instance is connected to the rpc so you don't need to call .connect
assert(instance.connected === true)
```

### Changing the RPC url

```ts
instance.setRpc('<new_rpc_url>')
await instance.connect()
```

### Connecting a wallet

Connect a private key to the sdk instance

```ts
instance.connectWallet(privateKey, {
    // options here
})
```

> [!TIP]
> The input of `.connectWallet` (and some other methods) depends on the specific chain. For example, on IBC, when connecting the wallet you need to specify the chain prefix and the denomination to use. Please refer to the specific chain sdk for details.

### Reading the wallet address

After you have connected a wallet, you can get it's address:

```ts
const address = instance.getAddress()
```

### Payments

You can initiate and sign a transaction to transfer the _default chain currency_ to an address using `preparePay`.

```ts
const signed_tx = instance.preparePay(address, '1')
```

You can initiate multiple transfers using `preparePays`.

```ts
const transfers = [
    {
        address: '<address>',
        amount: '1',
    },
    {
        address: '<another address>',
        amount: '0.25',
    },
]

const signed_txs = instance.preparePays(transfers)
```

`prepareTransfer` and `prepareTransfers` are aliases of the above methods.

### Cleaning up

When you no longer need the instance, disconnect the rpc and your wallet.

```ts
await instance.disconnect()
```
