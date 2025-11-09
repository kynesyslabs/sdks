# Multichain Core Clients
- `src/multichain/core/` provides per-chain classes (APTOS, EVM, IBC, MULTIVERSX, SOLANA, TON, BTC, XRPL, NEAR, TEN) exporting consistent methods: `connect`/`connectWallet`, `preparePay(s)`, `signTransaction(s)`, `getBalance`, and contract utilities.
- Many classes add chain-specific logic: BTC builds PSBTs and UTXO scans, SOLANA runs Anchor/raw programs, MULTIVERSX tracks multi-tx nonces, IBC handles gas estimation and ibcSend, etc.
- Shared helpers sit in `utils.ts` (`required` guard) and `types/` for default chain interfaces.