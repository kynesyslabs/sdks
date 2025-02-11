# MultiversX (EGLD)

MultiversX (formerly Elrond) is a highly scalable, fast, and secure blockchain platform for distributed apps, enterprise use cases, and the new internet economy.

## Creating the SDK instance

To interact with the MultiversX blockchain, you first need to create an instance of the SDK. Here's how you can do it:

```ts
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"

const rpc_url = "https://testnet-api.multiversx.com"

const instance = await MULTIVERSX.create(rpc_url)
```

The instance is now connected to the MultiversX testnet and ready to be used.

## Connecting your wallet

You can connect your wallet using a private key (keyFile) and password as shown below:

```ts
const keyFile = '{"version":4,...}' // Your keyFile JSON string
const password = "your-wallet-password"

await instance.connectWallet(keyFile, {
    password: password,
})
```

Note: In a web environment, if you don't provide a keyFile and password, the SDK will attempt to connect using the MultiversX DeFi Wallet browser extension.

## Getting your address

You can get your address using the `getAddress` method:

```ts
const address = instance.getAddress()
```

## Preparing a transaction

You can prepare a transaction using the `preparePay` method:

```ts
const recipientAddress = "erd1..."
const amount = "0.00001" // in EGLD

const tx = await instance.preparePay(recipientAddress, amount)
```

The `preparePay` method returns a signed transaction ready to be sent to a DEMOS node.

## Preparing multiple transactions

You can prepare multiple transactions using the `preparePays` method:

```ts
const transfers = [
    { address: "erd1...", amount: "0.00001" },
    { address: "erd1...", amount: "0.00002" },
]

const txs = await instance.preparePays(transfers)
```

The `preparePays` method returns an array of signed transactions. These transactions are signed with increasing nonces derived from the account's current nonce on the network.

## Cleaning up

When you're done with the SDK instance, you can disconnect your wallet:

```ts
await instance.disconnect()
```

## Signing a message

```ts
await instance.signMessage(message: string)

returns signature: string
```

## Verifying a message

```ts
await instance.verifyMessage(
                    message: string,
                    signature: string,
                    walletAddress: string,
                )

returns true or false
```

## Hacking

The DEMOS MultiversX SDK provides a limited set of methods to interact with the blockchain. For more advanced usage, you can access the underlying objects:

| Property | Type | Description |
|----------|------|-------------|
| `instance.provider` | [`INetworkProvider`](https://github.com/multiversx/mx-sdk-js-network-providers/blob/main/src/interface.ts) | Provides access to network data |
| `instance.wallet` | [`UserSigner`](https://github.com/multiversx/mx-sdk-js-wallet/blob/main/src/userSigner.ts) or [`ExtensionProvider`](https://github.com/multiversx/mx-sdk-js-extension-provider/blob/main/src/extensionProvider.ts) | Manages wallet operations |

### Example
To get all the tokens owned by an address (a feature not directly implemented in the SDK):

```ts
const address = instance.getAddress()
const tokens = await instance.provider.getAllEsdtTokens(new Address(address))

tokens.forEach(token => {
    console.log(`Token: ${token.identifier}, Balance: ${token.balance}`)
})
```

This example uses the `getAllEsdtTokens` method from the underlying `INetworkProvider`, which is not directly exposed in the DEMOS SDK.

For more advanced operations, refer to the following documentation:
- [MultiversX SDK Core](https://github.com/multiversx/mx-sdk-js-core)
- [MultiversX SDK Network Providers](https://github.com/multiversx/mx-sdk-js-network-providers)
- [MultiversX SDK Wallet](https://github.com/multiversx/mx-sdk-js-wallet)