# Native Bridge Flow
- `src/bridge/nativeBridge.ts` exposes a `methods` object for RPC integration.
- Key steps: `validateChain` enforces supported origin/destination combos, `generateOperation` builds and signs `BridgeOperation` payloads, and `generateOperationTx` (lines ~102-142) converts compiled operations into Demos relay transactions with proper nonce/fee scaffolding.
- Uses `Hashing`/`Cryptography` utilities for operation signatures and prepares zero-amount reflexive transactions tagged with `nativeBridge` types.