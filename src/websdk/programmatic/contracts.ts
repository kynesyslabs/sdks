import { DemosContracts } from "../DemosContracts"
import type { ContractInstance } from "../../contracts/ContractInstance"
import type {
    ContractABI,
    ContractCallOptions,
    ContractCallResult,
    ContractDeployOptions,
} from "../../contracts/types/ContractABI"
import type { ProgrammaticContext } from "./context"

/**
 * Smart-contract operations exposed under `demos.run.contracts`.
 *
 * IMPORTANT — these do NOT go through the shared fee-cap runner. Unlike the
 * other `demos.run.*` namespaces, contract deploy/call are **RPC-native**:
 * they execute directly over `demos.rpcCall` and return the contract's own
 * result types (`ContractInstance`, `ContractCallResult`, gas `bigint`),
 * never a {@link ProgrammaticTxResult}. There is no separate
 * `confirm → broadcast` stage here, so {@link ProgrammaticTxOptions}
 * (`maxFee`, `confirm`, `wait`) do not apply.
 *
 * NOTE: like `ipfs.*` and `d402.pay`, the smart-contract path is **not
 * enabled on production nodes yet** — these methods are wired and typed but
 * cannot be exercised end-to-end until the network turns the feature on.
 *
 * The namespace is a thin, uniform surface over {@link DemosContracts};
 * instantiate-free access for callers who want everything under
 * `demos.run.*`.
 */
export function createContractsNamespace(ctx: ProgrammaticContext) {
    const contracts = new DemosContracts(ctx.demos)

    return {
        /**
         * Deploy a smart contract from source. Requires a connected wallet.
         *
         * RPC-native (not fee-capped). Returns the deployed
         * {@link ContractInstance}, not a `ProgrammaticTxResult`.
         *
         * @example
         * ```ts
         * const c = await demos.run.contracts.deploy(source, [arg1, arg2])
         * await demos.run.contracts.call(c.address, "transfer", [to, 100])
         * ```
         *
         * @param source - Contract source code.
         * @param constructorArgs - Constructor arguments (default `[]`).
         * @param options - Deploy options (gas, etc.).
         */
        deploy: (
            source: string,
            constructorArgs?: unknown[],
            options?: ContractDeployOptions,
        ): Promise<ContractInstance> =>
            contracts.deploy(source, constructorArgs as any[], options),

        /**
         * Get a handle to an already-deployed contract. Read-only; no tx.
         *
         * @param address - The contract address.
         * @param abi - Optional ABI to type the instance.
         */
        at: <T = unknown>(
            address: string,
            abi?: ContractABI,
        ): Promise<ContractInstance<T>> => contracts.at<T>(address, abi),

        /**
         * Call a method on an existing contract by address.
         *
         * RPC-native (not fee-capped). Returns the raw
         * {@link ContractCallResult}, not a `ProgrammaticTxResult`.
         *
         * @param contractAddress - Target contract address.
         * @param method - Method name to invoke.
         * @param args - Method arguments (default `[]`).
         * @param options - Call options (gas, etc.).
         */
        call: <T = unknown>(
            contractAddress: string,
            method: string,
            args?: unknown[],
            options?: ContractCallOptions,
        ): Promise<ContractCallResult<T>> =>
            contracts.call<T>(contractAddress, method, args as any[], options),

        /**
         * Deploy a contract from a named template.
         *
         * @param templateName - Registered template name.
         * @param params - Template parameters.
         */
        deployTemplate: (
            templateName: string,
            params?: Record<string, unknown>,
        ): Promise<ContractInstance> =>
            contracts.deployTemplate(templateName, params),

        /**
         * Estimate gas for a contract call. Read-only; no tx.
         *
         * @param contractAddress - Target contract address.
         * @param method - Method name.
         * @param args - Method arguments (default `[]`).
         */
        estimateGas: (
            contractAddress: string,
            method: string,
            args?: unknown[],
        ): Promise<bigint> =>
            contracts.estimateGas(contractAddress, method, args as any[]),

        /** Start a batch of deploy/call operations (see {@link DemosContracts.batch}). */
        batch: () => contracts.batch(),

        /** List the available contract template names. */
        getAvailableTemplates: (): string[] =>
            contracts.getAvailableTemplates(),
    }
}
