# L2PS Workflow
- `src/l2ps/l2ps.ts` implements the `L2PS` manager: maintains encrypted payload instances, `create`/`getInstance` lifecycle, and AES-based `encryptTx`/`decryptTx` routines.
- Supports multiple tenants with `hasInstance`/`removeInstance`, exposes config accessors (`setConfig`, `getConfig`), and surfaces `getKeyFingerprint` for verifying keys.