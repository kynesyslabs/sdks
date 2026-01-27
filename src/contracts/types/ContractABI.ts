/**
 * Contract ABI type definitions for typed contract interactions
 */

/**
 * Function parameter definition in ABI
 */
export interface ABIParameter {
    name: string
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
    description?: string
    optional?: boolean
}

/**
 * Function definition in ABI
 */
export interface ABIFunction {
    name: string
    parameters: ABIParameter[]
    returns?: {
        type: string
        description?: string
    }
    description?: string
    visibility?: 'public' | 'private' | 'protected'
    mutability?: 'view' | 'pure' | 'payable' | 'nonpayable'
}

/**
 * Event definition in ABI
 */
export interface ABIEvent {
    name: string
    parameters: ABIParameter[]
    description?: string
}

/**
 * Complete contract ABI
 */
export interface ContractABI {
    contractName: string
    version?: string
    description?: string
    constructor?: {
        parameters: ABIParameter[]
        description?: string
    }
    functions: ABIFunction[]
    events?: ABIEvent[]
    state?: {
        [key: string]: {
            type: string
            description?: string
            initialValue?: any
        }
    }
}

/**
 * Contract metadata stored on-chain
 */
export interface ContractMetadata {
    name?: string
    description?: string
    version?: string
    abi?: ContractABI
    author?: string
    license?: string
    tags?: string[]
}

/**
 * Contract call result
 */
export interface ContractCallResult<T = any> {
    success: boolean
    result?: T
    error?: string
    gasUsed?: bigint
    events?: Array<{
        name: string
        args: Record<string, any>
    }>
    transactionHash?: string
    blockHeight?: number
}

/**
 * Contract deployment result
 */
export interface ContractDeploymentResult {
    success: boolean
    contractAddress?: string
    deploymentTx?: string
    gasUsed?: bigint
    error?: string
    blockHeight?: number
}

/**
 * Options for contract calls
 */
export interface ContractCallOptions {
    value?: bigint | number  // DEM to send with the call
    gasLimit?: bigint | number
    nonce?: number
    waitForConfirmation?: boolean
    confirmations?: number
}

/**
 * Options for contract deployment
 */
export interface ContractDeployOptions extends ContractCallOptions {
    metadata?: ContractMetadata
    validateSource?: boolean
    compileFirst?: boolean
}