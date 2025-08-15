## Inter-Blockchain Communication Protocol (IBC)

IBC is a blockchain interoperability protocol used by 110+ chains. It enables secure, permissionless, feature-rich cross-chain interactions.

## Creating the SDK instance
I'll be using the Stargaze testnet for the examples.

```ts
import { IBC } from "@demosdk/demosdk/xm-websdk"

const rpc_url = "https://rpc.elgafar-1.stargaze-apis.com"

const instance = await IBC.create(rpc_url)
```

The instance is now connected to the Stargaze testnet and ready to be used.

## Connecting your wallet

You can connect your wallet using a mnemonic as shown below.

```ts
const mnemonic = "stumble august fancy ..."

await instance.connectWallet(mnemonic, {
    prefix: "stars",
    gasPrice: "0.012ustars",
})

Or

await instance.connectWallet(mnemonic, {
    prefix: "cosmos",
    gasPrice: "0",
})

```

When connecting your wallet, you also need to specify the address prefix for your chain and the gas price to be used when creating transactions.

## Getting your address

You can get your address using the `getAddress` method.

```ts
const address = instance.getAddress()
```

## Preparing a transaction

You can prepare a transaction using the `preparePay` method.

```ts
const tx = await instance.preparePay(address, "1", {
    denom: "ustars",
})
```

When creating a transaction, you need to specify the recipient address, the amount to be transferred, and the token denomination.

## Preparing multiple transactions

You can prepare multiple transactions using the `preparePays` method.

```ts
const txs = await instance.preparePays(
    [
        { address: "stars1zyxw...", amount: "1" },
        { address: "stars1abcd...", amount: "1" },
    ],
    {
        denom: "ustars",
    },
)
```

The `preparePays` method returns an array of signed transactions ready to be sent to a DEMOS node. The transactions are signed with an incrementing nonce derived from the ledger sequence.

## Cleaning up

When you're done with the SDK instance, you can disconnect your wallet and RPC connection.

```ts
await instance.disconnect()
```

## Signing a message

```ts
await instance.signMessage(message: string)

await instance.signMessage(message: string, {
                          privateKey: string,
                      })

`privateKey` is the private key of that wallet address, which is used to connect the wallet

returns signature: string
```

## Verifying a message

```ts
await instance.verifyMessage(
                    message: string,
                    signature,
                    base64PublicKey: string,
                )

returns true or false

`base64PublicKey` is the public key of the wallet address
After connecting the wallet, need to get the public key and conver it to base64 format

let base64PublicKey = ""
const sep256k1HdWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: "cosmos",
})

const walletAccounts = await sep256k1HdWallet.getAccounts()
const currentAccount = walletAccounts.find(account =>
    account.address.startsWith("cosmos"),
    )

    if (currentAccount) {
        const pubKey = currentAccount.pubkey
        base64PublicKey = Buffer.from(pubKey).toString("base64")
    }
```

## Hacking

The DEMOS IBC SDK is built on top of the [CosmJS](https://github.com/cosmos/cosmjs) library, and only provides a limited set of methods to interact with the blockchain.

You can access the underlying CosmJS objects to have more control over the transactions and interactions with the blockchain.

Here is a list of the objects you can access:

| Property | Type | Description |
|----------|------|-------------|
| `instance.provider` | [StargateClient](https://cosmos.github.io/cosmjs/latest/stargate/classes/StargateClient.html) | Provides read-only access to blockchain data |
| `instance.wallet` | [SigningStargateClient](https://cosmos.github.io/cosmjs/latest/stargate/classes/SigningStargateClient.html) | Allows for signing and broadcasting transactions |
| `instance.signer` | [DirectSecp256k1Wallet](https://cosmos.github.io/cosmjs/latest/proto-signing/classes/DirectSecp256k1Wallet.html) or [DirectSecp256k1HdWallet](https://cosmos.github.io/cosmjs/latest/proto-signing/classes/DirectSecp256k1HdWallet.html) | Manages the private key and signing operations |

### Example
To get the latest block, you can use the `getBlock` method.

```ts
const block = await instance.provider.getBlock()
```
