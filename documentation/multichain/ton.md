# The Open Network (TON)

A decentralized and open internet, created by the community using a technology designed by Telegram.

## Setting up a wallet

Install the [Tonkeeper](https://tonkeeper.com/) wallet extension in your browser and create your wallet. Then export your recovery phrase by going to `Settings > Recovery Phrase`. Enter your password and save your phrase.

## Creating the SDK instance

You need a HTTP endpoint provider to access the TON network. We'll use the endpoint provided by [Orbs.com](https://www.orbs.com/ton-access/) for that.

Install the `@orbs-network/ton-access` package in your project to get started.

```bash
yarn add @orbs-network/ton-access
```

Then create the SDK instance as follows:

```ts
import { TON } from "@kimcalc/demosdk/xm-websdk"
import { getHttpEndpoint } from "@orbs-network/ton-access"

// Get the rpc url
const endpoint = await getHttpEndpoint({
    network: "testnet",
})

const instance = await TON.create(endpoint)
```

## Connecting your wallet

You can connect your wallet using a mnemonic as follows:

```ts
await instance.connectWallet("wall park wife ...")
```

## Getting your address

You can get your wallet address as follows:

```ts
const address = instance.getAddress()
```

## Creating a transaction

Now you can create a signed TON transfer transaction.

```ts
const tx = await instance.prepareTransfer(
    "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    "1",
)
```

The `tx` will be a signed [BOC](https://docs.ton.org/develop/data-formats/cell-boc) buffer that can be sent to a DEMOS node for broadcasting.

## Creating multiple transactions

You can create multiple transfer transactions using the `prepareTransfers` method.

```ts
const transfers = [
    {
        address: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
        amount: "1",
    },
    {
        address: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
        amount: "1",
    },
]

const txs = await instance.prepareTransfers(transfers)
```

## Cleaning up

You can remove your wallet and RPC connections as follows:

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
                    publicKey: string,
                )

`publicKey` is the public key of that wallet address, which is used to sign a message

returns true or false
```

## Hacking

The DEMOS TON sdk is built on top of the [TonJs](https://github.com/ton-org/ton) library, and only provides a limited set of methods to interact with the TON blockchain.

You can access the underlying TonJs objects to have more control over the transactions and interactions with the blockchain.

Here is a list of the objects you can access:

| Property            | Type                                                                                  | Description                                      |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `instance.provider` | [TonClient](https://ton-community.github.io/ton/classes/TonClient.html)               | Provides read-only access to blockchain data     |
| `instance.signer`   | [KeyPair](https://ton-community.github.io/ton/classes/KeyPair.html)                   | Allows for signing and broadcasting transactions |
| `instance.wallet`   | [WalletContractV4](https://ton-community.github.io/ton/classes/WalletContractV4.html) | Manages the private key and signing operations   |

## Resources

1. [Official TON Website](https://ton.org/en)
1. [Official TON Docs](https://docs.ton.org/learn/introduction)
1. [Official TON JS Client](https://github.com/ton-org/ton)
1. [Explore TON wallets](https://ton.org/en/wallets)
1. [Ton web JS client]()
1. [Tonviewer - TON Block explorer](https://testnet.tonviewer.com/)
