# DemosWork Engine
- `src/demoswork/work.ts` defines the `DemosWork` container for multi-step workflows with `push`, `validate`, and JSON serialization helpers; `prepareDemosWorkPayload` builds transaction-ready payloads.
- `src/demoswork/executor/stepexecutor.ts` executes scripted steps, while `operations/` and `validator/` house reusable step logic and validation contracts.