# Codebase Structure Overview

## Root Directory Structure
```
sdks/
├── src/                    # Source code
├── build/                  # Compiled output (generated)
├── documentation/          # Project documentation
├── .github/               # GitHub workflows and hooks
├── .vscode/               # VS Code configuration
├── tests/                 # Test files (within src/)
└── Configuration files
```

## Source Code Organization (`src/`)

### Core Modules
- **`index.ts`**: Main SDK export file
- **`types/`**: TypeScript type definitions

### Major Functional Areas
- **`multichain/`**: Multi-blockchain support
  - `core/`: Core blockchain implementations
  - `websdk/`: Web-compatible blockchain SDKs
  - `localsdk/`: Local/server blockchain SDKs
  
- **`bridge/`**: Cross-chain bridge functionality
  - Native bridge operations
  - Rubic bridge integration
  - **Currently modified**: `nativeBridge.ts` (gasless operations)

- **`encryption/`**: Cryptographic functionality
  - Post-Quantum Cryptography (PQC)
  - Zero-Knowledge primitives
  - Fully Homomorphic Encryption (FHE)

- **`websdk/`**: Web-specific SDK components
  - Demos class and transactions
  - Web authentication
  - Browser-compatible utilities

- **`wallet/`**: Wallet integration
  - Multi-chain wallet operations
  - Passkey support
  - Wallet management

### Supporting Systems
- **`abstraction/`**: Identity and provider abstractions
- **`demoswork/`**: Workflow execution engine
- **`l2ps/`**: Layer 2 Privacy Solution
- **`instant_messaging/`**: P2P communication
- **`utils/`**: Common utilities and helpers
- **`tests/`**: Comprehensive test suites

## Export Structure (package.json exports)
```
@kynesyslabs/demosdk/
├── .                      # Main SDK
├── ./types                # Type definitions
├── ./websdk              # Web SDK
├── ./demoswork           # Workflow engine
├── ./xmcore              # Multichain core
├── ./xm-websdk           # Multichain web SDK
├── ./xm-localsdk         # Multichain local SDK
├── ./wallet              # Wallet functionality
├── ./abstraction         # Identity abstraction
├── ./l2ps                # Layer 2 Privacy
├── ./utils               # Utilities
├── ./encryption          # Cryptography
└── ./bridge              # Bridge operations
```

## Test Organization
Tests are organized by functional area and include:
- **Multichain tests**: Chain-specific functionality
- **Transaction tests**: Full transaction workflows
- **Identity tests**: Authentication and identity management
- **Cryptography tests**: PQC and encryption
- **Bridge tests**: Cross-chain bridge operations
- **Integration tests**: End-to-end scenarios

## Key Architectural Patterns
- **Modular design**: Each major feature area is self-contained
- **Multi-export strategy**: Different entry points for different use cases
- **Chain abstraction**: Unified interface across different blockchains
- **Web/Node compatibility**: Separate modules for different environments
- **Extensive testing**: Comprehensive test coverage for all major features