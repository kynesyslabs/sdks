import { Transaction, TransactionContent } from "../Transaction"
import { NativeBridgeOperationCompiled } from "@kynesyslabs/bridge"

export type NativeBridgeTransactionContent = Omit<TransactionContent, 'type' | 'data'> & {
    type: 'nativeBridge'
    data: ['nativeBridge', NativeBridgeOperationCompiled]
}

export interface NativeBridgeTransaction extends Omit<Transaction, 'content'> {
    content: NativeBridgeTransactionContent
} 