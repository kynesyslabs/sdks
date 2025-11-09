# Smart-Contract Tooling
- `src/contracts/ContractFactory.ts` and `DemosContracts` share construction helpers: `deploy`, `deployTemplate`, `batch`, and `estimateGas` route through `ContractDeployer` + `ContractInteractor`.
- `src/contracts/ContractInteractor.ts` centralizes contract calls: `call`/`viewCall`, batch execution, `transactionCall` for state changes, and `waitForTransaction` polling.
- `ContractFactory.at` instantiates typed proxies at existing addresses while reusing the shared `Demos` context.