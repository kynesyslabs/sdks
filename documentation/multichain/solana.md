# Solana
A small guide to the SOLANA multichain SDK.


## Introduction to Solana
[Solana](https://solana.com/) is a "high performance" with roots in finance, smart contracts and NFTs. Solana has roots in other areas like gaming, but those won't be covered in this guide. 

## Core Concepts

1. [Transactions](https://solana.com/docs/core/transactions)
2. [Accounts (addresses)](https://solana.com/docs/core/accounts)
3. [Programs (smart contracts)](https://solana.com/docs/core/programs)

## How Solana Handles Nonces

Contrary to other networks like Ethereum, Solana does not use an integer nonce. Instead, a recent block hash is used to invalidate old transactions (those signed more than 150 blocks ago). While this works well for most cases, it makes signing offline transactions impossible.

Enter durable nonces.

Durable nonces are 32-byte base58 encoded strings used in place of the recent block hash when signing a transaction. Durable nonces can only be advanced by broadcasting a transaction instruction to advance it. When signing a transaction using durable nonces, the first instruction is supposed to be the advance nonce instruction.

How do they work?

Durable nonces requires a separate nonce account which stores the current nonce value. The account can be created using the `@solana/web3.js` sdk [as shown here](https://solana.com/developers/guides/advanced/introduction-to-durable-nonces#create-nonce-accounts).

While durable nonces fix the initial problem of offline transactions, since these nonces are strings, we can't advance them locally and thus we lose the ability to sign multiple offline transactions at the same time using nonces.

Since a transaction needs to be broadcasted to advance the nonce, signing multiple transactions using a durable nonce would use the same value for all transactions causing only the first to be valid.

[[More on Durable Nonces]](https://solana.com/developers/guides/advanced/introduction-to-durable-nonces)

## Setting up your wallet

Install the [Phantom wallet extension](https://phantom.app/) to create a new wallet. Then export your Solana secret key by going to `Settings > Manage Accounts > {Wallet Name} > Show Private Key`.

Airdrop some test SOL from the [Solana Faucet](https://solfaucet.com) for testing. 

> The testnet faucet is empty, so you need to use the devnet.

## Using the Sdk

The solana sdk provides a utility function to get the rpc url.

```ts
import { clusterApiUrl } from "@solana/web3.js"
import { SOLANA } from "@kynesyslabs/demosdk/xm-<localsdk|websdk>"

const rpc_url = clusterApiUrl("devnet")
const instance = await SOLANA.create(rpc_url)
```

### Connecting your wallet

```ts
await instance.connectWallet("<YOUR_PRIVATE_KEY>")
```

### Sending SOL

```ts
const signed_tx = await instance.preparePay(
  "tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g",
  "0.1",
)
```

The signed transaction is a serialized form of itself (`Uint8Array`) that can now be sent to a DEMOS node for broadcasting.

## Multi token send

```ts
const signed_txs = await instance.preparePays([
  {
    address: '<ADDRESS>',
    amount: '1'
  },
  {
    address: '<ANOTHER_ADDRESS>',
    amount: '2'
  },
])
```

The signed transactions will be signed using the recent block hash and therefore are only valid for the next few minutes.

### Executing a program
> COMING SOON!

### NFTs
> COMING SOON!

## Resources

1. [The Solana Cookbook](https://solanacookbook.com/)
2. [The Solana Program Library](https://spl.solana.com/)
3. [ANCHOR - Solana Sealevel Framework ](https://www.anchor-lang.com/)
4. [Javascript Client](https://solana.com/docs/clients/javascript)
5. [Known Programs [Github]](https://github.com/solana-labs/explorer/blob/master/app/utils/programs.ts)
6. 

