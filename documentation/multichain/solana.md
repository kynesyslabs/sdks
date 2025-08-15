# Solana

A small guide to the SOLANA multichain SDK.

## Introduction to Solana

[Solana](https://solana.com/) is a "high performance" network with roots in finance, smart contracts and NFTs. Solana has roots in other areas like gaming, but those won't be covered in this guide.

## Core Concepts

Solana runs on the following core concepts:

1. [Accounts](https://solana.com/docs/core/accounts)
2. [Transactions](https://solana.com/docs/core/transactions)
3. [Programs (smart contracts)](https://solana.com/docs/core/programs)

### Accounts

In Solana, accounts are used to store data. Each account has a unique address which can be used to access the stored data.

There are 3 types of accounts:

1. Data accounts - they store data.
2. Program accounts - they host program code
3. Native accounts - native Solana programs, eg. the System account which is responsible for creating all accounts.

An account in Solana is like a file in a normal operating system, and it can contain any data as defined by a program.

The account you create via a wallet is categorized as a data account owned by the System program. An account hosting your program code is a program account owned by you (your account).

An account stores data that looks like this:

```ts
{
  data: bytes,
  executable: boolean,
  lamports: number, // balance
  owner: PublicKey
}
```

A lamport is the smallest unit of SOL (1 SOL = 1 billion lamports)

[[Accounts - Solana Cookbook](https://solanacookbook.com/core-concepts/accounts.html#facts)] | [[Accounts - Solana Docs](https://solana.com/docs/core/accounts)]

### Programs

A program is a smart contract running on the Solana network.

Programs do not store data themselves, instead they store data in acccounts.

## How Solana Handles Nonces

Contrary to other networks like Ethereum, Solana does not use an integer nonce. Instead, a recent block hash is used to invalidate old transactions (those signed more than 150 blocks ago). While this works well for most cases, it makes signing offline transactions impossible.

Enter durable nonces.

Durable nonces are 32-byte base58 encoded strings used in place of the recent block hash when signing a transaction. Durable nonces can only be advanced by broadcasting a transaction instruction to advance it. When signing a transaction using durable nonces, the first instruction is supposed to be the advance nonce instruction.

How do they work?

Durable nonces requires a separate nonce account which stores the current nonce value. The account can be created using the `@solana/web3.js` sdk [as shown here](https://solana.com/developers/guides/advanced/introduction-to-durable-nonces#create-nonce-accounts).

While durable nonces fix the initial problem of offline transactions, since these nonces are strings, we can't advance them locally and thus we lose the ability to sign multiple offline transactions at the same time using nonces.

Since a transaction needs to be broadcasted to advance the nonce, signing multiple transactions using a durable nonce would use the same value for all transactions causing only the first to be valid.

[[More on Durable Nonces](https://solana.com/developers/guides/advanced/introduction-to-durable-nonces)]

## Setting up your wallet

Install the [Phantom wallet extension](https://phantom.app/) to create a new wallet. Then export your Solana secret key by going to `Settings > Manage Accounts > {Wallet Name} > Show Private Key`.

Airdrop some test SOL from the [Solana Faucet](https://solfaucet.com) for testing.

> The testnet faucet is empty, so you need to use the devnet.

## Using the Sdk

The solana sdk provides a utility function to get the [rpc url](https://solana.com/rpc).

```ts
import { clusterApiUrl } from "@solana/web3.js"
import { SOLANA } from "@demosdk/demosdk/xm-<localsdk|websdk>"

const testnet = clusterApiUrl("testnet")
// const devnet = clusterApiUrl("devnet")
// const mainnet = clusterApiUrl("mainnet-beta")

const instance = await SOLANA.create(testnet)
```

### Connecting your wallet

Pass the base58 representation of your private key to `.connectWallet`:

```ts
await instance.connectWallet(
    "25WecT1ApBVs9PEpNgsgEYJEjDMGqc63jeq1dWxwmzTCBPo6nnKq7NwyzicARJPfvQNrFGNjB7Kx6UvLFpH1MNsz",
)
```

On the browser, you can also try to connect to the [Phantom](https://phantom.app) browser extension by calling `.connectWallet` without an argument.

```ts
await instance.connectWallet()

// instance.wallet: PhantomProvider
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
        address: "tKeYE4wtowRb8yRroZShTipE18YVnqwXjsSAoNsFU6g",
        amount: "1",
    },
    {
        address: "CU3pJe9E3NxyBMWbTAJYjoahut9juerfmmjCin2g8ipG",
        amount: "2",
    },
])
```

The signed transactions will be signed using the recent block hash and therefore are only valid for the next few minutes.

### Programs

To execute a program on solana, you need to have its address (program Id) and IDL.

On Solana, an IDL (interface definition language) is what an ABI is to an EVM smart contract. It is a programs's public interface. It define its methods, inputs and types.

### When the IDL is available

Here's an example IDL of a program running on the Solana Mainnet: https://explorer.solana.com/address/MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD/anchor-program

```ts
// Getting the IDL
const idl = await instance.getProgramIdl(
    "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
)
```

You can use the IDL to collect and convert user input to the type specified in the IDL.

### The structure of the IDL

A typical IDL looks like this:

```ts
type Idl = {
    version: string
    name: string
    instructions: IdlInstruction[]
    accounts?: IdlAccountDef[]
    errors?: IdlErrorCode[]
    types?: IdlTypeDef[]
    constants?: IdlConstant[]
}

type IdlInstruction = {
    name: string
    accounts: IdlAccount[]
    args: IdlField[]
}

type IdlAccount = {
    name: string
    isMut: boolean
    isSigner: boolean
}
```

The `instructions` are a list of the methods defined on the program. An instruction can require arguments which are declared on the `args` property. When the instruction is reading data or modifying dadta, the data account's address is needed. If data is being modified, the private key of the account's owner is required to sign the transaction.

You can determine the number of signers required by checking how many accounts have a `isSigner` flag.

<!-- The required System program addresses will be autofilled by the sdk.

Examples:

```
tokenProgram
systemProgram
``` -->

Invoking a program:

```ts
const programId = "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD"
const programParams = {
    instruction: "deposit",
    idl: idl,
    args: {
        lamports: 100,
    },
    accounts: {
        // example account:
        receiver: "address",
        // other accounts here ...
    },
    feePayer: publicKey,
    signers: [Keypair, Keypair], // all signers
}

const signedTx = await instance.runAnchorProgram(programId, programParams)
```

After broadcasting the transaction to the network, you can await its confirmation and then read an account data.

```ts
await instance.provider.confirmTransaction(txhash, "finalized")

// account affected by program invocation
const modifiedAccount = new PublicKey(
    "5dDANLFBcmFyFQonFcJsE9i3YqK74JPAMAiL1WXmWKSL",
)

const account = await instance.fetchAccount(modifiedAccount, {
    idl: idl,
    name: "newAccount", // account name
    programId: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD", // optional
})

console.log(account.data)
```

The IDL and `accountName` are needed to deserialize the account data

### When the IDL is not available

When you don't have the IDL, you need to know:

1. The name of the instruction
2. The index of the instruction on the program definition
3. The proper format and type of the instruction parameters
4. The accounts needed
5. The signers needed by the instruction.

With all that in place, you can do the following:

```ts
const programId = "yourProgramId"
const account = new Keypair()

// accounts
const accounts = [
    {
        pubkey: account.publicKey,
        isSigner: true,
        isWritable: true,
    },
]

// parameters
const params = {
    space: 100,
}

const instructionIndex = 8
const instructionName = "ixName"

// the signed tx
const signedTx = await instance.runRawProgram(programId, {
    instructionName,
    instructionIndex,
    params,
    keys: accounts,
    feePayer: account.publicKey,
    signers: [account],
})
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

<!-- TODO: Review this with some fresh eyes! -->

### NFTs

> COMING SOON!

## Resources

1. [The Solana Cookbook](https://solanacookbook.com/)
2. [The Solana Program Library](https://spl.solana.com/)
3. [ANCHOR - Solana Sealevel Framework ](https://www.anchor-lang.com/)
4. [Javascript Client](https://solana.com/docs/clients/javascript)
5. [Known Programs [Github]](https://github.com/solana-labs/explorer/blob/master/app/utils/programs.ts)
6. [Interacting with Custom Programs](https://solana.com/docs/clients/javascript#interacting-with-custom-programs)
