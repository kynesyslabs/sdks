# Identity Abstraction
- `src/abstraction/Identities.ts` houses the monolithic `Identities` service: infer/add/remove Web2 IDs (Discord/GitHub/Twitter/Telegram/UD), bind PQC credentials, resolve Unstoppable Domains, and fetch DemosID mappings.
- Helpers generate signature payloads, validate referrals, and integrate with unified crypto for signing/verification.
- Supporting utilities: `CoinFinder` for chain-native token lookup and `providers/` catalog chain-specific abstraction providers.