# Web Contract Orchestration
- `src/websdk/DemosContracts.ts` wraps on-chain contract management for browsers.
- Exposes deployment (`deploy`, `deployTemplate`), accessors (`at`, `call`), batching (`batch`), and gas estimation.
- Integrates with template metadata helpers (`getAvailableTemplates`, `getTemplateSchema`, `validateTemplate`).
- Relies on the underlying `Demos` instance for signing/broadcasting.