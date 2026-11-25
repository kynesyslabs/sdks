// Compile against the built SDK; no runtime import or connection is needed.
import type {
    ContractABI,
    ContractCallOptions,
    ContractCallResult,
    ContractDeployOptions,
} from "@kynesyslabs/demosdk/websdk"

export const options: ContractCallOptions = { waitForConfirmation: true }
export const deployOptions: ContractDeployOptions = { metadata: { name: "Example" } }
export declare const abi: ContractABI
export declare const result: ContractCallResult<string>
export const value: string | undefined = result.result
// @ts-expect-error The generic result is a string, not a number.
export const invalid: number | undefined = result.result
