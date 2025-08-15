# XRP Ledger (XRPL)

The XRP Ledger is a decentralized cryptographic ledger powered by a network of peer-to-peer servers. It is fast, energy efficient, and reliable, with low transaction costs. XRP is the native cryptocurrency of the XRP Ledger, used to facilitate transactions on the network.

## Core Concepts

1. Accounts: [XRPL Accounts](https://xrpl.org/accounts.html)
2. Transactions: [Transaction Basics](https://xrpl.org/transaction-basics.html)
3. Consensus: [XRPL Consensus](https://xrpl.org/consensus.html)
4. Fees: [XRPL Fees](https://xrpl.org/fees.html)

## Setting up your wallet

To interact with the XRP Ledger, you need a wallet. You can use various wallet solutions, such as:

-   [GemWallet](https://gemwallet.app/)

For development purposes, you can generate a test wallet using the [XRPL Faucet](https://xrpl.org/xrp-testnet-faucet.html).

## Creating the SDK Instance

Import the SDK and create a new instance:

```ts
import { XRPL } from "@kimcalc/demosdk/xm-websdk"

const rpc_url = "wss://s.altnet.rippletest.net:51233"
const with_reconnect = false

const instance = new XRPL(rpc_url)

await instance.connect(with_reconnect)
```

The `with_reconnect` parameter is optional and defaults to `true`. It is used to specify whether the SDK should attempt to reconnect to the XRPL if the web socket connection is lost.

> NOTE: The XRPL SDK uses a web socket connection. A HTTP RPC client is not supported.

## Connecting your wallet

To perform transactions, connect your wallet to the SDK:

```ts
await instance.connectWallet("sEd7rBGm5kxzauR...")
```

You can view the address of your connected wallet using the `getAddress` method:

```ts
const address = instance.getAddress()
console.log(`Address: ${address}`)
```

## Getting balance

To get the balance of an account:

```ts
const balance = await instance.getBalance("rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe")
console.log(`Balance: ${balance} XRP`)
```

## Token transfer

To create a transaction to transfer XRP, use the `preparePay` method:

```ts
const signedTx = await instance.preparePay(
    "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    "10",
)
```

The `signedTx` object contains the signed transaction that can be used in a DEMOS transaction.

## Multiple transfers

To prepare multiple transfers at once, use the `preparePays` method:

```ts
const transfers = [
    { address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe", amount: "10" },
    { address: "rUCzEr6jrEyMpjhs4wSdQdz4g8Y382NxfM", amount: "20" },
]
const signedTxs = await instance.preparePays(transfers)
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

## Advanced Usage

The DEMOS XRPL SDK is built on top of the [XRPL JS Library](https://js.xrpl.org/), and provides a limited set of methods to interact with the XRP Ledger.

For more advanced use cases, you can access the underlying API to have more control over the transactions and interactions with the blockchain.

Here is a list of the objects you can access:

| No. | Method                        | Description                                                                              |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `instance.provider`           | The [Client](https://js.xrpl.org/classes/Client.html) instance from the `xrpl` library   |
| 2   | `instance.wallet`             | The [Wallet](https://js.xrpl.org/classes/Wallet.html) instance for the connected account |
| 3   | `instance.signTransaction(s)` | Sign one or multiple transactions                                                        |
| 4   | `xrplGetLastSequence`         | Get the last sequence number for an address                                              |

You can use these methods to create custom transactions or perform more complex operations on the XRP Ledger.

## Resources

-   [XRPL Website](https://xrpl.org/)
-   [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)
-   [XRPL Docs](https://xrpl.org/docs.html)
-   [XRPL JS Library](https://js.xrpl.org/)
-   [XRPL Explorer (Testnet)](https://testnet.xrpl.org/)
