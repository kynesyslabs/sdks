# Wallet Adapter Layer
- `src/multichain/websdk/` hosts browser-facing wrappers per chain (aptos, evm, solana, near, ton, xrp, btc, ibc, multiversx) built for wallet adapters and injected providers.
- These modules normalize connect/sign flows for frontends, deferring heavy lifting to the corresponding `core` classes while handling adapter quirks.