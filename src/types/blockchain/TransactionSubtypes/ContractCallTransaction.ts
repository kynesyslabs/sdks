import { Transaction, TransactionContent } from "../Transaction"

/**
 * Payload for contract method call transactions
 */
export interface ContractCallPayload {
    contractAddress: string     // Target contract address
    method: string             // Method name to call
    args: any[]               // Method arguments
    value?: bigint            // Optional DEM to send with call
}

/**
 * Transaction content type for contract call operations
 */
export type ContractCallTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'contractCall'
    data: ['contractCall', ContractCallPayload]
}

/**
 * Complete contract call transaction interface
 */
export interface ContractCallTransaction extends Omit<Transaction, 'content'> {
    content: ContractCallTransactionContent
}

export default ContractCallTransaction