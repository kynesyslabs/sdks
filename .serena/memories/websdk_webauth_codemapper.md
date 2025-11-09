# Demos Web Authentication
- `src/websdk/DemosWebAuth.ts` manages mnemonic/login state for browser sessions.
- Singleton via `getInstance`; `create`/`login` generate or restore ed25519+RSA keypairs and persist them; `logout` clears state.
- Offers `sign`/`verify` for WebAuth payloads and exposes helpers like `keyPairFromMnemonic` and `rsa()` for compatibility.