# Ethereum Virtual Machine (EVM)

The Ethereum Virtual Machine (EVM) is the runtime environment for smart contracts in Ethereum. It's a fundamental part of the Ethereum network and is used by many other blockchain platforms that aim to provide Ethereum-like functionality. Our EVM SDK provides a simple interface to interact with EVM-compatible blockchains.

## Core Concepts

1. [Accounts](https://ethereum.org/en/developers/docs/accounts/): Ethereum addresses that can hold balance and send transactions
2. [Transactions](https://ethereum.org/en/developers/docs/transactions/): Signed data packages that store a message to be sent from an externally owned account
3. [Gas](https://ethereum.org/en/developers/docs/gas/): The fee required to execute operations on the Ethereum network
4. [Smart Contracts](https://ethereum.org/en/developers/docs/smart-contracts/): Programs that run on the Ethereum blockchain

## Setting up your wallet

To interact with EVM-compatible chains, you'll need a wallet with a private key. You can use tools like MetaMask or hardware wallets to generate and manage your keys securely.

For testing purposes, you can use faucets to get testnet tokens. For example, for Sepolia testnet:

-   [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
-   [Chainlink Sepolia Faucet](https://faucets.chain.link/sepolia)

## Initialization

Import the SDK and create a new instance:

```ts
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

const rpc_url = "https://sepolia.infura.io/v3/YOUR-PROJECT-ID"
const instance = await EVM.create(rpc_url)
```

## Connecting your wallet

To create signed transaction payloads, you need to connect your wallet to the SDK:

```ts
const privateKey = "0x1234567890abcdef..." // Your private key
await instance.connectWallet(privateKey)
```

You can view the address of your connected wallet using the `getAddress` method:

```ts
const address = instance.getAddress()
console.log(`Address: ${address}`)
```

## Creating a token transfer payload

To create a signed transaction payload to transfer ETH, you can use the `preparePay` method:

```ts
const recipientAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
const amount = "0.1" // Amount in ETH
const signedTx = await instance.preparePay(recipientAddress, amount)
```

The `signedTx` is a signed transaction that can be used a DEMOS transaction.

## Creating multiple transfer payload

You can prepare multiple signed transaction payloads at once using the `preparePays` method:

```ts
const transfers = [
    { address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", amount: "0.1" },
    { address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", amount: "0.2" },
]
const signedTxs = await instance.preparePays(transfers)
```

The `signedTxs` is an array of signed transaction payloads that can be used in a DEMOS transaction.

## Checking balance

You can check the balance of an address using the `getBalance` method:

```ts
const balance = await instance.getBalance(
    "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
)
console.log(`Balance: ${balance} ETH`)
```

## Working with smart contracts

The SDK provides methods to interact with smart contracts:

```ts
const contractAddress = "0x..."
const abi = [...] // Contract ABI

const contract = await instance.getContractInstance(contractAddress, abi)

// Read from contract
const result = await instance.readFromContract(contract, "functionName", [arg1, arg2])

// Write to contract
await instance.writeToContract(contract, "functionName", [arg1, arg2])
```

## Listening for events (Not implemented)

You can listen for specific events or all events from a contract:

```ts
// Listen for a specific event
instance.listenForEvent("EventName", contractAddress, abi)

// Listen for all events
instance.listenForAllEvents(contractAddress, abi)
```

## Cleaning up

To disconnect your wallet and clean up resources, you can use the `disconnect` method:

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

## Advanced usage

For more advanced use cases, you can access underlying properties and methods of the EVM instance:

| No. | Property/Method               | Description                                                            | API Reference                                                                           |
| --- | ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `instance.provider`           | The JsonRpcProvider instance for interacting with the Ethereum network | [JsonRpcProvider](https://docs.ethers.org/v6/api/providers/jsonrpc/#JsonRpcProvider)    |
| 2   | `instance.wallet`             | The Wallet instance representing the connected account                 | [Wallet](https://docs.ethers.org/v6/api/wallet/#Wallet)                                 |
| 3   | `instance.contracts`          | A Map of Contract instances for interacting with smart contracts       | [Contract](https://docs.ethers.org/v6/api/contract/#Contract)                           |
| 6   | `instance.signTransaction(s)` | Method(s) to sign one or multiple transactions                         | [Wallet.signTransaction](https://docs.ethers.org/v6/api/wallet/#Wallet-signTransaction) |

You can use these properties and methods to perform custom operations:

```ts
const blockNumber = await instance.provider.getBlockNumber()
```

## API Reference

todo!

## Resources

- [Ethereum Website](https://ethereum.org)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)
- [MetaMask](https://metamask.io/)
- [Sepolia Testnet Faucet](https://sepoliafaucet.com/)
- [Ethereum Block Explorer (Mainnet)](https://etherscan.io/)
- [Sepolia Block Explorer](https://sepolia.etherscan.io/)