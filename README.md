# Demos SDK

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kynesyslabs/sdks)



![npm version](https://img.shields.io/npm/v/@kynesyslabs/demosdk)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

A JavaScript/TypeScript SDK providing a unified interface for interacting with the Demos network and cross-chain operations.

***IMPORTANT*** This SDK is built with bun and performs the best with bun

## Requirements

- Node.js 18.0 or higher
- TypeScript 5.0 or higher (for TypeScript projects)

## Installation

```sh
bun install @kynesyslabs/demosdk
```

or

```sh
npm install @kynesyslabs/demosdk
```

or

```sh
yarn add @kynesyslabs/demosdk
```

## Features

### Core Modules

- **WebSDK**: Browser-compatible SDK for web applications
- **Cross-chain Core**: Unified interface for multiple blockchain networks
- **DemosWork**: Workflow execution engine
- **Wallet**: Wallet management and cryptographic operations
- **Bridge**: Cross-chain asset bridging via Rubic protocol
- **Abstraction**: Chain-agnostic transaction and balance queries
- **Encryption**: Post-quantum cryptography and zero-knowledge proofs

### Supported Blockchains

- EVM-compatible: Ethereum, BSC, Polygon, Arbitrum, Optimism
- Non-EVM: Solana, Bitcoin, TON, Near, MultiversX, Cosmos IBC, XRP

## Usage

### Basic Import

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { prepareXMPayload } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork } from "@kynesyslabs/demosdk/demoswork"
```

### Module Exports

The SDK provides multiple entry points:

- `@kynesyslabs/demosdk` - Main entry point
- `@kynesyslabs/demosdk/websdk` - Web SDK components
- `@kynesyslabs/demosdk/xm-websdk` - Cross-chain web SDK
- `@kynesyslabs/demosdk/xm-localsdk` - Cross-chain local SDK
- `@kynesyslabs/demosdk/xmcore` - Cross-chain core functionality
- `@kynesyslabs/demosdk/demoswork` - Workflow engine
- `@kynesyslabs/demosdk/wallet` - Wallet utilities
- `@kynesyslabs/demosdk/abstraction` - Chain abstraction layer
- `@kynesyslabs/demosdk/bridge` - Bridging functionality
- `@kynesyslabs/demosdk/encryption` - Cryptographic utilities
- `@kynesyslabs/demosdk/utils` - Common utilities
- `@kynesyslabs/demosdk/types` - TypeScript type definitions
- `@kynesyslabs/demosdk/l2ps` - Layer 2 payment solutions

## Quick Start

### Initialize and Connect Wallet

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// 1. Initialize Demos SDK (no parameters)
const demos = new Demos()

// 2. Connect to the network
const rpc = "https://demosnode.discus.sh"
await demos.connect(rpc)

// 3. Generate a new mnemonic or use existing one
const mnemonic = demos.newMnemonic() // Generates 12-word mnemonic
// const mnemonic = "your existing mnemonic phrase..." // Or use existing

// 4. Connect your wallet
await demos.connectWallet(mnemonic)

// 5. Get your wallet address
const address = demos.getAddress()
console.log("Wallet address:", address)
```

### Native Transaction Example

```typescript
// Send native DEM tokens
const tx = await demos.transfer(
  "0x6690580a02d2da2fefa86e414e92a1146ad5357fd71d594cc561776576857ac5",
  100 // amount in DEM
)

// Confirm and broadcast transaction
const validityData = await demos.confirm(tx)
const result = await demos.broadcast(validityData)
```

### Cross-chain Transaction Example

```typescript
import { 
  prepareXMPayload, 
  prepareXMScript 
} from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// 1. Create cross-chain payload (e.g., Ethereum Sepolia)
const evm = await EVM.create("https://rpc.ankr.com/eth_sepolia")
await evm.connectWallet("your_ethereum_private_key")

const evmTx = await evm.preparePay(
  "0xRecipientAddress",
  "0.001" // 0.001 ETH
)

// 2. Create XMScript
const xmscript = prepareXMScript({
  chain: "eth",
  subchain: "sepolia", 
  signedPayloads: [evmTx],
  type: "pay"
})

// 3. Convert to Demos transaction
const tx = await prepareXMPayload(xmscript, demos)

// 4. Confirm and broadcast
const validityData = await demos.confirm(tx)
const result = await demos.broadcast(validityData)
```

## Development

### Building from Source

```sh
# Install dependencies first
bun install  # or npm install, or yarn install

# Then build
bun run build  # or npm run build, or yarn build
```

### Local Development

To use the SDK from a local source:

```sh
# Build the SDK
bun run build  # or yarn build, or npm run build

# In your project
bun add file:../path/to/sdks  # or yarn/npm add file:../path/to/sdks
```

### Testing

Run specific test suites (works with both bun and yarn):

```sh
bun test:multichain    # Cross-chain SDK payload generation
bun test:tx           # Cross-chain transaction tests
bun test:demoswork    # DemosWork operations
bun test:native       # Native payment transactions
bun test:identities   # Identity management
bun test:web2         # Web2 proxy functionality
bun test:bridge       # Bridge service tests
bun test:btc          # Bitcoin-specific tests
bun test:evm          # EVM chain tests
bun test:pqc          # Post-quantum cryptography

# Or with yarn/npm:
yarn test:multichain
npm run test:multichain
```

### Automatic Build Validation

The repository includes a pre-commit hook that automatically validates the build before allowing commits. This hook is installed automatically when you run `bun install` (or npm/yarn install).

#### Features
- Automatically runs `build` command before each commit
- Works with bun, npm, or yarn (auto-detects available package manager)
- Prevents commits if the build fails
- Installs automatically on `bun/npm/yarn install`

#### Bypassing the Check
For debugging or temporary commits, you can skip the build check:
1. Start your commit message with 'DEBUG' or 'TEMP'
2. Use `git commit --no-verify`
3. Use `GIT_SKIP_BUILD=true git commit`

## Publishing

The SDK is automatically published to NPM when:

1. The version in `package.json` is incremented
2. Changes are committed with a message starting with "release"
3. The commit is pushed to GitHub

Example:
```sh
git commit -m "release v2.3.25"
git push
```

For simplicity, a `publish.sh` script is included. By default it will ask to forward the version, but you can re-publish the same version number with `./publish.sh -r`.

## Documentation

- **API Reference**: [https://kynesyslabs.github.io/demosdk-api-ref/](https://kynesyslabs.github.io/demosdk-api-ref/)
- **Developer Guides**: [https://docs.kynesys.xyz/](https://docs.kynesys.xyz/)

## Contributing

We welcome contributions to the Demos SDK. Please ensure:

1. All tests pass before submitting a PR
2. Code follows the existing style and conventions
3. New features include appropriate test coverage
4. Documentation is updated for API changes

## Support

- **Issues**: [GitHub Issues](https://github.com/kynesyslabs/demosdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kynesyslabs/demosdk/discussions)
- **Security**: For security issues, please email security@kynesys.xyz

## License

MIT
