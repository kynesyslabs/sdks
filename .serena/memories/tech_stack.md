# Technology Stack

## Primary Technologies
- **Language**: TypeScript 5.4.3 with strict mode
- **Runtime**: Bun (preferred) with Node.js 20.19.4 compatibility
- **Module System**: CommonJS with ESM interoperability
- **Target**: ES2020 with ES2021 libraries

## Build & Development
- **Compiler**: TypeScript with resolve-tspaths for path resolution
- **Build Tool**: Custom build script using tsc
- **Package Manager**: Bun (primary), with pnpm-lock.yaml and yarn support
- **Path Resolution**: `@/*` aliases mapped to src root

## Testing & Quality
- **Testing Framework**: Jest 29.7.0 with ts-jest
- **Test Timeout**: 20 seconds (for blockchain operations)
- **Linting**: ESLint with TypeScript parser
- **Code Formatting**: Prettier with specific configuration
- **Documentation**: TypeDoc for API documentation

## Key Dependencies
### Blockchain Libraries
- @aptos-labs/ts-sdk, @cosmjs/stargate, @multiversx/sdk-core
- @solana/web3.js, @ton/core, ethers, web3, xrpl
- bitcoinjs-lib, near-api-js

### Cryptography
- @noble/curves, @noble/hashes, @noble/post-quantum
- libsodium-wrappers-sumo, node-forge, node-seal
- falcon-js, mlkem, ntru, sphincs, superdilithium

### Bridge & Integration
- rubic-sdk for bridge operations
- @simplewebauthn for authentication
- axios for HTTP requests
- socket.io-client for real-time communication

## Platform Support
- Cross-platform: Linux, macOS, Windows/WSL2
- Browser compatibility through websdk module
- Node.js environment support