/**
 * Base interface for typed contract interactions
 */

import { ContractCallOptions, ContractCallResult } from './ContractABI'

/**
 * Base interface that all typed contracts should extend
 */
export interface TypedContract {
    address: string
    call<T = any>(method: string, args: any[], options?: ContractCallOptions): Promise<ContractCallResult<T>>
}

/**
 * Generic contract interface for runtime type safety
 */
export type ContractInterface<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? T[K]
        : never
}

/**
 * Helper type to extract function parameter types
 */
export type ContractMethodParams<T> = T extends (...args: infer P) => any ? P : never

/**
 * Helper type to extract function return type
 */
export type ContractMethodReturn<T> = T extends (...args: any[]) => infer R ? R : never

/**
 * Contract instance type that wraps methods
 */
export interface ContractInstance<T = any> extends TypedContract {
    address: string
    abi?: any
    methods: T
    
    // Direct method access (proxy pattern)
    [key: string]: any
}