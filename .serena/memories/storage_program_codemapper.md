# On-Network Storage
- `src/storage/StorageProgram.ts` encapsulates storage smart contract workflows: `createStorageProgram`, `writeStorage`, `readStorage`, and `deleteStorageProgram` manage nested structured data.
- Addresses derived via `deriveStorageAddress`; includes validation helpers for payload size/depth and ACL updates (`updateAccessControl`).