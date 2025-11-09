# Encryption & Crypto Core
- `src/encryption/unifiedCrypto.ts` defines `UnifiedCrypto`: multi-algorithm key manager with instance pooling, seed derivation, identity generation, and ed25519/PQC/RSA sign+verify plus encrypt/decrypt helpers.
- `src/encryption/Cryptography.ts` offers file/key serialization, `sign`/`verify`, and bundled ed25519/RSA implementations; `Hashing.ts` exposes SHA utilities.
- Use these modules for any signing, encryption, or hashing across the SDK.