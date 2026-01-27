# Wallet Manager
- `src/wallet/Wallet.ts` manages local key material: `create`/`load`/`loadFromKey`, persistent storage, and access to ed25519/RSA pairs.
- Transaction API: `transfer` builds/broadcasts payments, `getBalance` queries funds, and `broadcast` relays signed blobs.
- Supports passkey generation via `generatePasskey` for WebAuthn flows.