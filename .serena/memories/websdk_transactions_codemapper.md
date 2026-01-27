# Browser Transaction Helpers
- `src/websdk/DemosTransactions.ts` exports the `DemosTransactions` utility object.
- Provides constructors: `empty()`, `prepare()` scaffolds, `pay`/`transfer` to fill in payment details.
- Signing pipeline: `sign` (ed25519 default), `signWithAlgorithm` (PQC support), and `confirm`/`broadcast` wrappers using a `Demos` instance.
- Supports storage and L2PS flows via `store` and `createL2PSHashUpdate`, the latter orchestrating DTR validator relays.