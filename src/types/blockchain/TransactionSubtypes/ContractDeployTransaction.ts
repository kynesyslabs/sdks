import { Transaction, TransactionContent } from "../Transaction"

/**
 * Contract metadata for deployment
 */
export interface ContractMetadata {
    name?: string
    description?: string
    version?: string
}

/**
 * Payload for contract deployment transactions
 */
export interface ContractDeployPayload {
    source: string              // TypeScript source code
    constructorArgs: any[]      // Constructor arguments
    metadata?: ContractMetadata // Optional metadata
}

/**
 * Transaction content type for contract deployment operations
 */
export type ContractDeployTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'contractDeploy'
    data: ['contractDeploy', ContractDeployPayload]
}

/**
 * Complete contract deployment transaction interface
 */
export interface ContractDeployTransaction extends Omit<Transaction, 'content'> {
    content: ContractDeployTransactionContent
}

export default ContractDeployTransaction