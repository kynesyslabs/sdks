# The Open Network (TON)


## Setting up a wallet

Install the [Tonkeeper](https://tonkeeper.com/) wallet extension in your browser and create your wallet. Then export your recovery phrase by going to `Settings > Recovery Phrase`. Enter your password and save your phrase.

## Using the sdk

You need a HTTP endpoint provider to access the TON network. We'll use the endpoint provided by [Orbs.com](https://www.orbs.com/ton-access/) for that.

Install the `@orbs-network/ton-access` package in your project to get started.

```ts
import { TON } from "@kynesyslabs/demosdk/xm-websdk"
import { getHttpEndpoint } from "@orbs-network/ton-access"

// Get the rpc url
const endpoint = await getHttpEndpoint({
    network: "testnet",
})

// Create a TON instance
instance = await TON.create(endpoint)
await instance.connect()
```

Connecting a wallet using a mnemonics string:

```ts
await instance.connectWallet("cats more cats ...")
```

Now you can create a signed TON transfer transaction.

```ts
const tx = await instance.prepareTransfer(
    "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    "1",
)
```

`tx` will a `BOC` buffer that can be sent to a DEMOS node for broadcasting.

You can access a private key and the underlying API provider as follows:

```ts
instance.provider // TonClient (see TonJs)

instance.signer // KeyPair

instance.wallet // WalletContractV4
```

## Resources

1. [Official TON Website](https://ton.org/en)
1. [Official TON Docs](https://docs.ton.org/learn/introduction)
1. [Official TON JS Client](https://github.com/ton-org/ton)
1. [Explore TON wallets](https://ton.org/en/wallets)
1. [Ton web JS client]()
1. [Tonviewer - TON Block explorer](https://testnet.tonviewer.com/)
